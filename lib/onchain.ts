// On-chain stake helper. Drives the user wallet through:
//   1. (if needed) factory.getOrCreate(hash, question)
//   2. (if needed) USDC.approve(market, amount)
//   3. market.stake(side, amount)
// All txs require user signature; emits progress so the UI can narrate.
"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  keccak256,
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

export async function stakeOnChain(opts: {
  question: string;
  side: StakeSide;
  amountDollars: number;
  onProgress?: (s: StakeProgress) => void;
}): Promise<{ marketAddress: Address; stakeTxHash: Hex }> {
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

  const hash = questionHash(question);
  const amount = toUsdcWei(amountDollars);

  // 1) Find or create the market
  let market = (await publicClient.readContract({
    address: TAKES_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getMarket",
    args: [hash],
  })) as Address;

  if (market === ZERO) {
    onProgress?.("creating-market");
    const txCreate = await walletClient.writeContract({
      address: TAKES_FACTORY,
      abi: FACTORY_ABI,
      functionName: "getOrCreate",
      args: [hash, question],
    });
    await publicClient.waitForTransactionReceipt({ hash: txCreate });
    market = (await publicClient.readContract({
      address: TAKES_FACTORY,
      abi: FACTORY_ABI,
      functionName: "getMarket",
      args: [hash],
    })) as Address;
    if (market === ZERO) {
      throw new StakeError(
        "Market creation tx confirmed but factory still has no market — this shouldn't happen.",
        "creating-market",
      );
    }
  }

  // 2) Approve USDC if allowance is insufficient
  const allowance = (await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account, market],
  })) as bigint;

  if (allowance < amount) {
    onProgress?.("approving");
    const txApprove = await walletClient.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [market, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: txApprove });
  }

  // 3) Stake
  onProgress?.("staking");
  const sideEnum = side === "yes" ? 0 : 1;
  const txStake = await walletClient.writeContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "stake",
    args: [sideEnum, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: txStake });

  onProgress?.("done");
  return { marketAddress: market, stakeTxHash: txStake };
}

export function progressLabel(p: StakeProgress): string {
  switch (p) {
    case "wallet":
      return "Connecting wallet…";
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
