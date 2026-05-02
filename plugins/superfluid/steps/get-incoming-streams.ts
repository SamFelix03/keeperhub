import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import { querySuperfluidSubgraph } from "./superfluid-core";

type IncomingStream = {
  id: string;
  senderAddress: string;
  receiverAddress: string;
  tokenAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
  flowRate: string;
  streamedUntilUpdatedAt: string;
  updatedAtTimestamp?: string;
};

type GetIncomingStreamsResult =
  | {
      success: true;
      streams: IncomingStream[];
      totalFlowRate: string;
      count: number;
    }
  | { success: false; error: string };

export type GetIncomingStreamsInput = StepInput & {
  network: string;
  walletAddress: string;
  tokenAddress?: string;
  limit?: string;
};

type StreamsQueryResponse = {
  streams: Array<{
    id: string;
    sender: { id: string };
    receiver: { id: string };
    token: { id: string; symbol?: string; name?: string };
    currentFlowRate: string;
    streamedUntilUpdatedAt: string;
    updatedAtTimestamp?: string;
  }>;
};

const GET_STREAMS_QUERY = `
  query GetIncomingStreams($receiver: String!, $limit: Int!) {
    streams(
      first: $limit
      orderBy: updatedAtTimestamp
      orderDirection: desc
      where: {
        receiver: $receiver
        currentFlowRate_gt: "0"
      }
    ) {
      id
      sender { id }
      receiver { id }
      token { id symbol name }
      currentFlowRate
      streamedUntilUpdatedAt
      updatedAtTimestamp
    }
  }
`;

async function stepHandler(
  input: GetIncomingStreamsInput
): Promise<GetIncomingStreamsResult> {
  const limit = Number.parseInt(input.limit ?? "50", 10);
  const resolvedLimit = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 200);

  try {
    const data = await querySuperfluidSubgraph<StreamsQueryResponse>(
      input.network,
      GET_STREAMS_QUERY,
      {
        receiver: input.walletAddress.toLowerCase(),
        limit: resolvedLimit,
      }
    );

    const streams = data.streams
      .filter((stream) => {
        if (!input.tokenAddress) {
          return true;
        }
        return stream.token.id.toLowerCase() === input.tokenAddress.toLowerCase();
      })
      .map((stream) => ({
        id: stream.id,
        senderAddress: stream.sender.id,
        receiverAddress: stream.receiver.id,
        tokenAddress: stream.token.id,
        tokenSymbol: stream.token.symbol,
        tokenName: stream.token.name,
        flowRate: stream.currentFlowRate,
        streamedUntilUpdatedAt: stream.streamedUntilUpdatedAt,
        updatedAtTimestamp: stream.updatedAtTimestamp,
      }));

    const totalFlowRate = streams
      .reduce((acc, stream) => acc + BigInt(stream.flowRate), BigInt(0))
      .toString();

    return {
      success: true,
      streams,
      totalFlowRate,
      count: streams.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch incoming streams: ${getErrorMessage(error)}`,
    };
  }
}

export async function getIncomingStreamsStep(
  input: GetIncomingStreamsInput
): Promise<GetIncomingStreamsResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "superfluid",
      actionName: "get-incoming-streams",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

export const _integrationType = "superfluid";
