import "server-only";

import { getChainIdFromNetwork } from "@/lib/rpc/network-utils";
import {
  type WriteContractResult,
  writeContractCore,
} from "@/plugins/web3/steps/write-contract-core";

const FETCH_TIMEOUT_MS = 15_000;

const SUBGRAPH_ENDPOINTS: Record<number, string> = {
  1: "https://subgraph-endpoints.superfluid.dev/eth-mainnet/protocol-v1",
  10: "https://subgraph-endpoints.superfluid.dev/optimism-mainnet/protocol-v1",
  137: "https://subgraph-endpoints.superfluid.dev/polygon-mainnet/protocol-v1",
  8453: "https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1",
  42161: "https://subgraph-endpoints.superfluid.dev/arbitrum-one/protocol-v1",
  84532: "https://subgraph-endpoints.superfluid.dev/base-sepolia/protocol-v1",
  11155420:
    "https://subgraph-endpoints.superfluid.dev/optimism-sepolia/protocol-v1",
};

const CFA_V1_FORWARDERS: Record<number, string> = {
  1: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  10: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  137: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  8453: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  42161: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  84532: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  11155420: "0xcfA132E353cB4E398080B9700609bb008eceB125",
};

const CFA_V1_FORWARDER_ABI = [
  {
    type: "function",
    name: "setFlowrate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "receiver", type: "address" },
      { name: "flowrate", type: "int96" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type GraphResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export function resolveSuperfluidChain(network: string): {
  chainId: number;
  endpoint: string;
} {
  const chainId = getChainIdFromNetwork(network);
  const endpoint = SUBGRAPH_ENDPOINTS[chainId];

  if (!endpoint) {
    throw new Error(
      `Superfluid subgraph is not configured for chain ID ${chainId}`
    );
  }

  return { chainId, endpoint };
}

export async function querySuperfluidSubgraph<T>(
  network: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const { endpoint } = resolveSuperfluidChain(network);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Superfluid subgraph request failed with HTTP ${response.status}: ${errorText}`
      );
    }

    const payload = (await response.json()) as GraphResponse<T>;
    if (payload.errors && payload.errors.length > 0) {
      const message = payload.errors[0]?.message || "Unknown GraphQL error";
      throw new Error(`Superfluid subgraph error: ${message}`);
    }

    if (!payload.data) {
      throw new Error("Superfluid subgraph returned no data");
    }

    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

type SetFlowRateInput = {
  network: string;
  tokenAddress: string;
  recipientAddress: string;
  flowRate: string;
  forwarderAddress?: string;
  gasLimitMultiplier?: string;
  usePrivateMempool?: boolean;
  strict?: boolean;
  _context?: {
    executionId?: string;
    organizationId?: string;
  };
};

export async function setFlowRateCore(
  input: SetFlowRateInput
): Promise<WriteContractResult> {
  const { chainId } = resolveSuperfluidChain(input.network);
  const forwarderAddress =
    input.forwarderAddress || CFA_V1_FORWARDERS[chainId] || "";

  if (!forwarderAddress) {
    return {
      success: false,
      error: `No CFA forwarder configured for chain ID ${chainId}`,
    };
  }

  return writeContractCore({
    contractAddress: forwarderAddress,
    network: input.network,
    abi: JSON.stringify(CFA_V1_FORWARDER_ABI),
    abiFunction: "setFlowrate",
    functionArgs: JSON.stringify([
      input.tokenAddress,
      input.recipientAddress,
      input.flowRate,
    ]),
    gasLimitMultiplier: input.gasLimitMultiplier,
    usePrivateMempool: input.usePrivateMempool,
    strict: input.strict,
    _context: input._context,
  });
}
