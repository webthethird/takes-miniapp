// On-chain stake helper. Drives the user wallet through:
//   1. (if needed) factory.getOrCreate(hash, question)
//   2. (if needed) USDC.approve(market, MAX) — max so future stakes skip approve
//   3. market.stake(side, amount)
//
// Uses sdk.wallet.getEthereumProvider() and calls provider.request directly
// for eth_sendTransaction. The Farcaster in-app wallet is finicky — viem's
// walletClient and wagmi-style abstractions can hang the Confirm button on
// mobile. This pattern matches what the V1 (serious) mini-app shipped.
//
// CREATE2 in the factory means the market's address is deterministic from
// (factory, questionHash, question, asset, currentYieldSource), so we can
// pre-approve to the predicted address before getOrCreate has executed.
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
  MARKET_ABI,
  TAKES_FACTORY,
  USDC,
  USDC_DECIMALS,
} from "./contracts";

export type StakeSide = "yes" | "no";

export type StakeProgress =
  | "idle"
  | "wallet"
  | "preparing"
  | "creating-market"
  | "approving"
  | "staking"
  | "done";

export class StakeError extends Error {
  constructor(message: string, public step: StakeProgress) {
    super(message);
    this.name = "StakeError";
  }
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";
// Some mobile wallets hang the Confirm button forever. Bound the wait so
// the UI can surface an error instead of looking dead.
const WALLET_PROMPT_TIMEOUT_MS = 60_000;

function toUsdcWei(dollars: number): bigint {
  return BigInt(Math.round(dollars * 10 ** USDC_DECIMALS));
}

function questionHash(question: string): Hex {
  return keccak256(toBytes(question));
}

type Call = { to: Address; data: Hex; step: StakeProgress };

export async function stakeOnChain(opts: {
  question: string;
  side: StakeSide;
  amountDollars: number;
  onProgress?: (s: StakeProgress) => void;
}): Promise<{ marketAddress: Address; txHashes: Hex[] }> {
  const { question, side, amountDollars, onProgress } = opts;
  onProgress?.("wallet");

  // Async — checks capabilities and may prompt the user to connect.
  const provider = await sdk.wallet.getEthereumProvider();
  if (!provider) {
    throw new StakeError(
      "No wallet available. Open this app inside Farcaster.",
      "wallet",
    );
  }

  // Chain check + switch
  try {
    const currentChainHex = (await provider.request({
      method: "eth_chainId",
    })) as string;
    const currentChainId = parseInt(currentChainHex, 16);
    if (currentChainId !== CHAIN.id) {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHex(CHAIN.id) }],
      });
    }
  } catch {
    throw new StakeError(
      `Your wallet doesn't support ${CHAIN.name} (chain id ${CHAIN.id}).`,
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

  // Resolve the market address. If it already exists we use the on-chain
  // record; otherwise we ask the factory to predict the CREATE2 address so
  // we can approve to it before getOrCreate has executed.
  const existingMarket = (await publicClient.readContract({
    address: TAKES_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getMarket",
    args: [hash],
  })) as Address;

  const marketExists = existingMarket !== ZERO;
  let market: Address;
  let allowance: bigint;
  if (marketExists) {
    market = existingMarket;
    allowance = (await publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account, market],
    })) as bigint;
  } else {
    market = (await publicClient.readContract({
      address: TAKES_FACTORY,
      abi: FACTORY_ABI,
      functionName: "predictMarket",
      args: [hash, question],
    })) as Address;
    allowance = BigInt(0);
  }

  // Build the call list
  const calls: Call[] = [];
  if (!marketExists) {
    calls.push({
      to: TAKES_FACTORY,
      data: encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: "getOrCreate",
        args: [hash, question],
      }),
      step: "creating-market",
    });
  }
  if (allowance < amount) {
    // Max-approve so subsequent stakes never need re-approval.
    calls.push({
      to: USDC,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [market, maxUint256],
      }),
      step: "approving",
    });
  }
  const sideEnum = side === "yes" ? 0 : 1;
  calls.push({
    to: market,
    data: encodeFunctionData({
      abi: MARKET_ABI,
      functionName: "stake",
      args: [sideEnum, amount],
    }),
    step: "staking",
  });

  // Try to bundle everything into one wallet popup via EIP-5792
  // wallet_sendCalls. Coinbase Smart Wallet (Farcaster's default) supports
  // this. If the wallet doesn't, fall back to sequential popups.
  onProgress?.("staking");
  const batched = await trySendBatch(provider, {
    from: account,
    chainId: CHAIN.id,
    calls,
    waitForReceipt: (h) => publicClient.waitForTransactionReceipt({ hash: h }),
  });
  if (batched) {
    onProgress?.("done");
    return { marketAddress: market, txHashes: batched };
  }

  // Sequential fallback. Each call gets its own wallet popup.
  const txHashes: Hex[] = [];
  for (const call of calls) {
    onProgress?.(call.step);
    const txHash = await sendTxWithTimeout(provider, {
      from: account,
      to: call.to,
      data: call.data,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    txHashes.push(txHash);
  }

  onProgress?.("done");
  return { marketAddress: market, txHashes };
}

// Try EIP-5792 wallet_sendCalls. Returns the underlying tx hashes on
// success, or null if the wallet doesn't support batching (caller should
// fall back to sequential sendTransaction).
async function trySendBatch(
  provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> },
  opts: {
    from: Address;
    chainId: number;
    calls: Call[];
    waitForReceipt: (hash: Hex) => Promise<unknown>;
  },
): Promise<Hex[] | null> {
  try {
    // EIP-5792 v2 params shape. atomicRequired is FALSE because Farcaster's
    // wallet executes batched calls sequentially, not atomically — setting
    // true causes the wallet to reject the bundle outright. Sequential
    // execution within one popup is still a 3x UX win over 3 popups.
    const params = {
      version: "2.0.0",
      from: opts.from,
      chainId: toHex(opts.chainId),
      atomicRequired: false,
      calls: opts.calls.map((c) => ({ to: c.to, data: c.data })),
    };

    const result = (await Promise.race([
      provider.request({
        method: "wallet_sendCalls",
        params: [params],
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new StakeError("Bundle submission timed out", "staking")),
          WALLET_PROMPT_TIMEOUT_MS,
        );
      }),
    ])) as { id: string } | string;

    const bundleId = typeof result === "string" ? result : result.id;

    // Poll for status
    const txHashes = await pollBundleStatus(provider, bundleId);
    // Wait for receipts so callers get a consistent "done" signal
    for (const h of txHashes) await opts.waitForReceipt(h);
    return txHashes;
  } catch (e) {
    if (isMethodNotSupported(e)) return null;
    throw e;
  }
}

function isMethodNotSupported(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  return (
    msg.includes("not support") ||
    msg.includes("unsupported method") ||
    msg.includes("method not found") ||
    msg.includes("does not exist") ||
    msg.includes("unknown method") ||
    // EIP-1474 standard error code for unsupported method
    (typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === -32601)
  );
}

async function pollBundleStatus(
  provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> },
  bundleId: string,
): Promise<Hex[]> {
  // EIP-5792 status: 100 = pending, 200 = confirmed, 400+ = failure
  for (let i = 0; i < 60; i++) {
    const status = (await provider.request({
      method: "wallet_getCallsStatus",
      params: [bundleId],
    })) as {
      status: number | string;
      receipts?: { transactionHash: Hex }[];
    };
    const code =
      typeof status.status === "number"
        ? status.status
        : status.status === "CONFIRMED"
          ? 200
          : status.status === "PENDING"
            ? 100
            : 0;
    if (code >= 200) {
      const hashes = (status.receipts ?? []).map((r) => r.transactionHash);
      if (code >= 400) {
        throw new StakeError(
          `Batched transaction failed (status ${code})`,
          "staking",
        );
      }
      return hashes;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new StakeError("Timed out waiting for batched tx", "staking");
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
    case "creating-market":
      return "Creating market on-chain…";
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
