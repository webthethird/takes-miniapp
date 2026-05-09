// On-chain stake helper. Drives the user wallet through:
//   1. (if needed) factory.getOrCreate(hash, question)
//   2. (if needed) USDC.approve(market, MAX) — max so future stakes skip approve
//   3. market.stake(side, amount)
//
// When the wallet supports EIP-5792 (Coinbase Smart Wallet, MetaMask 12+,
// Rabby, etc.), all calls are bundled into a single popup via
// wallet_sendCalls. Otherwise we fall back to sequential popups.
//
// CREATE2 in the factory means the market's address is deterministic from
// (factory, questionHash, question, asset, currentYieldSource), so we can
// pre-approve to the predicted address before getOrCreate has executed.
"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  keccak256,
  maxUint256,
  toBytes,
  toHex,
  type Address,
  type EIP1193Provider,
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
  | "submitting"
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

function toUsdcWei(dollars: number): bigint {
  return BigInt(Math.round(dollars * 10 ** USDC_DECIMALS));
}

function questionHash(question: string): Hex {
  return keccak256(toBytes(question));
}

type Call = { to: Address; data: Hex };

export async function stakeOnChain(opts: {
  question: string;
  side: StakeSide;
  amountDollars: number;
  onProgress?: (s: StakeProgress) => void;
}): Promise<{ marketAddress: Address; txHashes: Hex[] }> {
  const { question, side, amountDollars, onProgress } = opts;
  onProgress?.("wallet");

  const provider = sdk.wallet.ethProvider as unknown as EIP1193Provider;
  if (!provider) throw new StakeError("No wallet connected", "wallet");

  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as Address[];
  if (!accounts || accounts.length === 0) {
    throw new StakeError("No wallet account available", "wallet");
  }
  const account = accounts[0];

  const chainIdHex = (await provider.request({
    method: "eth_chainId",
  })) as Hex;
  if (parseInt(chainIdHex, 16) !== CHAIN.id) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHex(CHAIN.id) }],
      });
    } catch {
      throw new StakeError(
        `Switch your wallet to ${CHAIN.name} (chain id ${CHAIN.id}) to continue.`,
        "wallet",
      );
    }
  }

  const walletClient = createWalletClient({
    chain: CHAIN,
    transport: custom(provider),
    account,
  });
  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(),
  });

  onProgress?.("preparing");

  const hash = questionHash(question);
  const amount = toUsdcWei(amountDollars);

  // Resolve the market address. If it already exists we use the on-chain
  // record; otherwise we ask the factory to predict the CREATE2 address so
  // we can pre-approve in the same batch.
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
  });

  onProgress?.("submitting");

  // Try the EIP-5792 batched path first; fall back to sequential popups
  // if the wallet doesn't support it.
  const txHashes: Hex[] = [];
  const batched = await trySendCallsBatch({
    provider,
    waitForReceipt: (h) => publicClient.waitForTransactionReceipt({ hash: h }),
    account,
    chainId: CHAIN.id,
    calls,
  });
  if (batched) {
    txHashes.push(...batched);
  } else {
    // Sequential fallback. Map call index -> step label for nicer progress.
    const stepLabels: StakeProgress[] = [];
    if (!marketExists) stepLabels.push("creating-market");
    if (allowance < amount) stepLabels.push("approving");
    stepLabels.push("staking");

    for (let i = 0; i < calls.length; i++) {
      onProgress?.(stepLabels[i]);
      const txHash = await walletClient.sendTransaction({
        to: calls[i].to,
        data: calls[i].data,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      txHashes.push(txHash);
    }
  }

  onProgress?.("done");
  return { marketAddress: market, txHashes };
}

// Returns the underlying tx hashes if the batch succeeded, or null if the
// wallet doesn't support wallet_sendCalls (in which case the caller should
// fall back to sequential sendTransaction).
async function trySendCallsBatch(opts: {
  provider: EIP1193Provider;
  waitForReceipt: (hash: Hex) => Promise<unknown>;
  account: Address;
  chainId: number;
  calls: Call[];
}): Promise<Hex[] | null> {
  const { provider, waitForReceipt, account, chainId, calls } = opts;

  // Capability check first. If the wallet doesn't expose the method or
  // rejects it, return null and let the caller fall back.
  try {
    type SendCallsParams = {
      version: string;
      from: Address;
      chainId: Hex;
      atomicRequired: boolean;
      calls: { to: Address; data: Hex; value?: Hex }[];
    };
    const params: SendCallsParams = {
      version: "2.0.0",
      from: account,
      chainId: toHex(chainId),
      atomicRequired: true,
      calls: calls.map((c) => ({ to: c.to, data: c.data })),
    };
    // EIP-5792 returns { id: string }
    const result = (await provider.request({
      method: "wallet_sendCalls" as never,
      params: [params] as never,
    })) as { id: string } | string;

    const bundleId = typeof result === "string" ? result : result.id;

    // Poll for bundle status until confirmed
    const txHashes = await pollBundleStatus(provider, bundleId);
    // Wait for receipts so callers get a consistent "done" signal
    for (const h of txHashes) {
      await waitForReceipt(h);
    }
    return txHashes;
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    // Method-not-found / unsupported → fall back. Other errors propagate.
    if (
      msg.includes("not support") ||
      msg.includes("unsupported method") ||
      msg.includes("method not found") ||
      msg.includes("does not exist") ||
      msg.includes("unknown method")
    ) {
      return null;
    }
    throw e;
  }
}

async function pollBundleStatus(
  provider: EIP1193Provider,
  bundleId: string,
): Promise<Hex[]> {
  // EIP-5792 status codes: 100=pending, 200=confirmed, 400=offchain failure,
  // 500=onchain reverted. Spec rev varies; treat status >= 200 as terminal.
  for (let i = 0; i < 60; i++) {
    const status = (await provider.request({
      method: "wallet_getCallsStatus" as never,
      params: [bundleId] as never,
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
          "submitting",
        );
      }
      return hashes;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new StakeError("Timed out waiting for batched tx", "submitting");
}

export function progressLabel(p: StakeProgress): string {
  switch (p) {
    case "wallet":
      return "Connecting wallet…";
    case "preparing":
      return "Preparing transaction…";
    case "submitting":
      return "Awaiting wallet confirmation…";
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
