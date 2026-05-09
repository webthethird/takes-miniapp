// On-chain config: addresses, ABIs, chain.
// Base Sepolia testnet deployment from /Users/webthethird/Ethereum/farcaster/takes-contracts.
import { baseSepolia } from "viem/chains";
import type { Address } from "viem";

export const CHAIN = baseSepolia;

export const TAKES_FACTORY: Address = "0x23d535a31A4DEB9c58D4F8fC4f111E922509B28B";
export const USDC: Address = "0x2cebb3DFf94B7cCB09FC218F91B70Ea35A0fFd1a";

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
