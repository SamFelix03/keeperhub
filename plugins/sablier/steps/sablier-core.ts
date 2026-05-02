import "server-only";

import { ethers } from "ethers";
import { getChainIdFromNetwork } from "@/lib/rpc/network-utils";
import { getRpcUrlByChainId } from "@/lib/rpc/rpc-config";

export const SABLIER_LOCKUP_READ_ABI = [
  {
    type: "function",
    name: "statusOf",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "withdrawableAmountOf",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    type: "function",
    name: "getDepositedAmount",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    type: "function",
    name: "getWithdrawnAmount",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    type: "function",
    name: "getRefundedAmount",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    type: "function",
    name: "getRecipient",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getSender",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getStartTime",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint40" }],
  },
  {
    type: "function",
    name: "getEndTime",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint40" }],
  },
] as const;

export const STREAM_STATUS_LABELS: Record<number, string> = {
  0: "PENDING",
  1: "STREAMING",
  2: "SETTLED",
  3: "CANCELED",
  4: "DEPLETED",
};

export function getSablierContract(network: string, contractAddress: string) {
  const chainId = getChainIdFromNetwork(network);
  const rpcUrl = getRpcUrlByChainId(chainId, "primary");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(contractAddress, SABLIER_LOCKUP_READ_ABI, provider);
}

export function parseStreamId(streamId: string): bigint {
  if (!streamId || streamId.trim() === "") {
    throw new Error("streamId is required");
  }
  return BigInt(streamId);
}

export async function safeRead<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return;
  }
}
