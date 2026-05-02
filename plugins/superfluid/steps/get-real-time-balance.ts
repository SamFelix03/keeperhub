import "server-only";

import { ethers } from "ethers";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { getChainIdFromNetwork } from "@/lib/rpc/network-utils";
import { getRpcUrlByChainId } from "@/lib/rpc/rpc-config";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import { querySuperfluidSubgraph } from "./superfluid-core";

const SUPER_TOKEN_READ_ABI = [
  {
    type: "function",
    name: "realtimeBalanceOfNow",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "availableBalance", type: "int256" },
      { name: "deposit", type: "uint256" },
      { name: "owedDeposit", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
] as const;

type GetRealTimeBalanceResult =
  | {
      success: true;
      availableBalance: string;
      deposit: string;
      owedDeposit: string;
      timestamp: string;
      totalInflowRate?: string;
      totalOutflowRate?: string;
      totalNetFlowRate?: string;
    }
  | { success: false; error: string };

export type GetRealTimeBalanceInput = StepInput & {
  network: string;
  walletAddress: string;
  tokenAddress: string;
};

type SnapshotQueryResponse = {
  accountTokenSnapshots: Array<{
    totalInflowRate?: string;
    totalOutflowRate?: string;
    totalNetFlowRate?: string;
  }>;
};

const SNAPSHOT_QUERY = `
  query Snapshot($account: String!, $token: String!) {
    accountTokenSnapshots(
      first: 1
      where: { account: $account, token: $token }
    ) {
      totalInflowRate
      totalOutflowRate
      totalNetFlowRate
    }
  }
`;

async function stepHandler(
  input: GetRealTimeBalanceInput
): Promise<GetRealTimeBalanceResult> {
  try {
    const chainId = getChainIdFromNetwork(input.network);
    const rpcUrl = getRpcUrlByChainId(chainId, "primary");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const token = new ethers.Contract(input.tokenAddress, SUPER_TOKEN_READ_ABI, provider);

    const [availableBalance, deposit, owedDeposit, timestamp] =
      (await token.realtimeBalanceOfNow(input.walletAddress)) as [
        bigint,
        bigint,
        bigint,
        bigint,
      ];

    let snapshot:
      | {
          totalInflowRate?: string;
          totalOutflowRate?: string;
          totalNetFlowRate?: string;
        }
      | undefined;

    try {
      const snapshotData = await querySuperfluidSubgraph<SnapshotQueryResponse>(
        input.network,
        SNAPSHOT_QUERY,
        {
          account: input.walletAddress.toLowerCase(),
          token: input.tokenAddress.toLowerCase(),
        }
      );
      snapshot = snapshotData.accountTokenSnapshots[0];
    } catch {
      // Non-fatal: realtime balance comes from on-chain call above.
    }

    return {
      success: true,
      availableBalance: availableBalance.toString(),
      deposit: deposit.toString(),
      owedDeposit: owedDeposit.toString(),
      timestamp: timestamp.toString(),
      totalInflowRate: snapshot?.totalInflowRate,
      totalOutflowRate: snapshot?.totalOutflowRate,
      totalNetFlowRate: snapshot?.totalNetFlowRate,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch real-time balance: ${getErrorMessage(error)}`,
    };
  }
}

export async function getRealTimeBalanceStep(
  input: GetRealTimeBalanceInput
): Promise<GetRealTimeBalanceResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "superfluid",
      actionName: "get-real-time-balance",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

export const _integrationType = "superfluid";
