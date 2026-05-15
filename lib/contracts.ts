// On-chain config: addresses, ABIs, chain.
// Base Sepolia testnet — USDC is Circle's canonical testnet token.
import { baseSepolia } from "viem/chains";
import type { Address } from "viem";

export const CHAIN = baseSepolia;

export const TAKES_FACTORY: Address = "0x9C3d7933DB8d03446810B5c07987e987a4bc78Db";
export const USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const USDC_DECIMALS = 6;

export const FACTORY_ABI = [
  {
    type: "function",
    name: "getOrCreate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "questionHash", type: "bytes32" },
      { name: "question", type: "string" },
    ],
    outputs: [{ name: "market", type: "address" }],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "questionHash", type: "bytes32" }],
    outputs: [{ name: "market", type: "address" }],
  },
  {
    type: "function",
    name: "predictMarket",
    stateMutability: "view",
    inputs: [
      { name: "questionHash", type: "bytes32" },
      { name: "question", type: "string" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const MARKET_ABI = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "side", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
