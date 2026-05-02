import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import { querySuperfluidSubgraph } from "./superfluid-core";

type StreamEvent = {
  id: string;
  transactionHash: string;
  blockNumber: string;
  timestamp: string;
  tokenAddress: string;
  senderAddress: string;
  receiverAddress: string;
  flowRate: string;
};

type GetStreamEventsResult =
  | {
      success: true;
      events: StreamEvent[];
      count: number;
    }
  | { success: false; error: string };

export type GetStreamEventsInput = StepInput & {
  network: string;
  walletAddress?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: string;
};

type EventsQueryResponse = {
  flowUpdatedEvents: Array<{
    id: string;
    transactionHash: string;
    blockNumber: string;
    timestamp: string;
    token: string;
    sender: string;
    receiver: string;
    flowRate: string;
  }>;
};

const EVENTS_QUERY = `
  query FlowUpdatedEvents($from: BigInt!, $to: BigInt!, $limit: Int!) {
    flowUpdatedEvents(
      first: $limit
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_gte: $from, timestamp_lte: $to }
    ) {
      id
      transactionHash
      blockNumber
      timestamp
      token
      sender
      receiver
      flowRate
    }
  }
`;

async function stepHandler(
  input: GetStreamEventsInput
): Promise<GetStreamEventsResult> {
  const now = Math.floor(Date.now() / 1000);
  const from = Number.parseInt(input.fromTimestamp ?? String(now - 3600), 10);
  const to = Number.parseInt(input.toTimestamp ?? String(now), 10);
  const limit = Number.parseInt(input.limit ?? "100", 10);
  const resolvedLimit = Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 500);

  try {
    const data = await querySuperfluidSubgraph<EventsQueryResponse>(
      input.network,
      EVENTS_QUERY,
      {
        from: Number.isNaN(from) ? now - 3600 : from,
        to: Number.isNaN(to) ? now : to,
        limit: resolvedLimit,
      }
    );

    const events = data.flowUpdatedEvents
      .filter((event) => {
        if (!input.walletAddress) {
          return true;
        }
        const wallet = input.walletAddress.toLowerCase();
        return (
          event.sender.toLowerCase() === wallet ||
          event.receiver.toLowerCase() === wallet
        );
      })
      .map((event) => ({
        id: event.id,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
        tokenAddress: event.token,
        senderAddress: event.sender,
        receiverAddress: event.receiver,
        flowRate: event.flowRate,
      }));

    return {
      success: true,
      events,
      count: events.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch stream events: ${getErrorMessage(error)}`,
    };
  }
}

export async function getStreamEventsStep(
  input: GetStreamEventsInput
): Promise<GetStreamEventsResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "superfluid",
      actionName: "get-stream-events",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

export const _integrationType = "superfluid";
