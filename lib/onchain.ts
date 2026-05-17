// On-chain stake helper. Drives the user wallet through:
//   1. (if needed) USDC.approve(factory, MAX) — max so subsequent stakes
//      on ANY market never need re-approval.
//   2. factory.stake(hash, question, lockupDuration, side, amount) —
//      single tx that creates the market if needed and stakes on the
//      caller's behalf.
//
// Allowance is scoped to the factory address — a fixed, single address —
// so after one approve a user can stake on any market with one popup.
//
// Uses sdk.wallet.getEthereumProvider() and calls provider.request
// directly for eth_sendTransaction. viem's walletClient added abstraction
// layers that hung the Farcaster in-app wallet's Confirm button on mobile.
"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  maxUint256,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  CHAIN,
  ERC20_ABI,
  FACTORY_ABI,
  TAKES_FACTORY,
  USDC,
  USDC_DECIMALS,
} from "./contracts";
import { LOCKUP_SECONDS } from "./constants";

export type StakeSide = "yes" | "no";

export type StakeProgress =
  | "idle"
  | "wallet"
  | "preparing"
  | "approving"
  | "staking"
  | "done";

export class StakeError extends Error {
  constructor(message: string, public step: StakeProgress) {
    super(message);
    this.name = "StakeError";
  }
}

// Some mobile wallets hang the Confirm button forever. Bound the wait so
// the UI can surface an error instead of looking dead.
const WALLET_PROMPT_TIMEOUT_MS = 60_000;

function toUsdcWei(dollars: number): bigint {
  return BigInt(Math.round(dollars * 10 ** USDC_DECIMALS));
}

function questionHash(question: string): Hex {
  return keccak256(toBytes(question));
}

export async function stakeOnChain(opts: {
  question: string;
  side: StakeSide;
  amountDollars: number;
  /// Lockup duration in seconds. Defaults to LOCKUP_SECONDS (30 days).
  /// The factory enforces [1 day, 365 days].
  lockupSeconds?: number;
  onProgress?: (s: StakeProgress) => void;
}): Promise<{ marketAddress: Address; txHashes: Hex[] }> {
  const { question, side, amountDollars, onProgress } = opts;
  const lockupSeconds = BigInt(opts.lockupSeconds ?? LOCKUP_SECONDS);
  onProgress?.("wallet");

  // Async — checks capabilities and may prompt the user to connect.
  const provider = await sdk.wallet.getEthereumProvider();
  if (!provider) {
    throw new StakeError(
      "No wallet available. Open this app inside Farcaster.",
      "wallet",
    );
  }

  // Chain check + switch. If the wallet doesn't know about CHAIN yet
  // (EIP-3326 error 4902), add it via wallet_addEthereumChain first.
  try {
    const currentChainHex = (await provider.request({
      method: "eth_chainId",
    })) as string;
    const currentChainId = parseInt(currentChainHex, 16);
    if (currentChainId !== CHAIN.id) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: toHex(CHAIN.id) }],
        });
      } catch (err) {
        if ((err as { code?: number })?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: toHex(CHAIN.id),
                chainName: CHAIN.name,
                nativeCurrency: CHAIN.nativeCurrency,
                rpcUrls: [...CHAIN.rpcUrls.default.http],
                blockExplorerUrls: CHAIN.blockExplorers?.default?.url
                  ? [CHAIN.blockExplorers.default.url]
                  : undefined,
              },
            ],
          });
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    const e = err as { code?: number; message?: string };
    console.error("[stake] chain switch failed", err);
    const detail = e?.code != null ? ` (code ${e.code})` : "";
    throw new StakeError(
      `Wallet rejected ${CHAIN.name} (chain id ${CHAIN.id})${detail}: ${e?.message ?? "unknown error"}`,
      "wallet",
    );
  }

  // Account
  let accounts = (await provider.request({
    method: "eth_accounts",
  })) as Address[];
  if (!accounts || accounts.length === 0) {
    accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as Address[];
  }
  if (!accounts || accounts.length === 0) {
    throw new StakeError("No wallet account available", "wallet");
  }
  const account = accounts[0];

  onProgress?.("preparing");

  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(),
  });

  const hash = questionHash(question);
  const amount = toUsdcWei(amountDollars);

  // USDC allowance is scoped to the factory once and reused across every
  // market and every top-up; check it and approve max if short.
  const allowance = (await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account, TAKES_FACTORY],
  })) as bigint;

  const txHashes: Hex[] = [];

  if (allowance < amount) {
    onProgress?.("approving");
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [TAKES_FACTORY, maxUint256],
    });
    const approveHash = await sendTxWithTimeout(provider, {
      from: account,
      to: USDC,
      data: approveData,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    txHashes.push(approveHash);
  }

  onProgress?.("staking");
  const sideEnum = side === "yes" ? 0 : 1;
  const stakeData = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: "stake",
    args: [hash, question, lockupSeconds, sideEnum, amount],
  });
  const stakeHash = await sendTxWithTimeout(provider, {
    from: account,
    to: TAKES_FACTORY,
    data: stakeData,
  });
  await publicClient.waitForTransactionReceipt({ hash: stakeHash });
  txHashes.push(stakeHash);

  // Read the market address from the factory now that it's been
  // get-or-created. Cheaper than parsing logs and works for both
  // first-stake (new market) and top-up (existing market) paths.
  const marketAddress = (await publicClient.readContract({
    address: TAKES_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getMarket",
    args: [hash, lockupSeconds],
  })) as Address;

  onProgress?.("done");
  return { marketAddress, txHashes };
}

// Direct provider.request call with clean string-only params and a timeout.
// viem's walletClient.sendTransaction added abstraction layers that hung the
// Farcaster in-app wallet's Confirm button — going through the EIP-1193
// provider directly side-steps that.
async function sendTxWithTimeout(
  provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> },
  params: { from: Address; to: Address; data: Hex; value?: bigint },
): Promise<Hex> {
  // Build clean string-only params — undefined values choke some mobile providers.
  const txParams: Record<string, string> = {
    from: params.from,
    to: params.to,
    data: params.data,
  };
  if (params.value !== undefined) {
    txParams.value = toHex(params.value);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const hash = (await Promise.race([
      provider.request({
        method: "eth_sendTransaction",
        params: [txParams],
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new StakeError(
              "Wallet didn't respond. The Confirm button may not be wired to this network.",
              "staking",
            ),
          );
        }, WALLET_PROMPT_TIMEOUT_MS);
      }),
    ])) as Hex;
    return hash;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function progressLabel(p: StakeProgress): string {
  switch (p) {
    case "wallet":
      return "Connecting wallet…";
    case "preparing":
      return "Preparing transaction…";
    case "approving":
      return "Approving USDC…";
    case "staking":
      return "Staking…";
    case "done":
      return "Staked ✓";
    default:
      return "";
  }
}
