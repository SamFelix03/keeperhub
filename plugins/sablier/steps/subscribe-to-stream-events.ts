import "server-only";

import { ethers } from "ethers";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { getChainIdFromNetwork } from "@/lib/rpc/network-utils";
import { getRpcUrlByChainId } from "@/lib/rpc/rpc-config";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";

type SubscribeToStreamEventsResult =
  | {
      success: true;
      subscription: {
        provider: "sablier";
        network: string;
        chainId: number;
        lockupContractAddress: string;
        webhookUrl: string;
        walletAddress?: string;
        eventTypes: string[];
        fromBlock: number;
        pollIntervalSeconds: number;
      };
      notes: string;
    }
  | { success: false; error: string };

export type SubscribeToStreamEventsInput = StepInput & {
  network: string;
  lockupContractAddress: string;
  webhookUrl: string;
  walletAddress?: string;
  eventTypes?: string;
  fromBlock?: string;
  pollIntervalSeconds?: string;
};

async function stepHandler(
  input: SubscribeToStreamEventsInput
): Promise<SubscribeToStreamEventsResult> {
  try {
    const chainId = getChainIdFromNetwork(input.network);
    const rpcUrl = getRpcUrlByChainId(chainId, "primary");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Number.parseInt(input.fromBlock ?? String(latestBlock), 10);
    const pollInterval = Number.parseInt(input.pollIntervalSeconds ?? "30", 10);

    const eventTypes = (input.eventTypes || "create,withdraw,cancel")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return {
      success: true,
      subscription: {
        provider: "sablier",
        network: input.network,
        chainId,
        lockupContractAddress: input.lockupContractAddress,
        webhookUrl: input.webhookUrl,
        walletAddress: input.walletAddress,
        eventTypes,
        fromBlock: Number.isNaN(fromBlock) ? latestBlock : fromBlock,
        pollIntervalSeconds: Number.isNaN(pollInterval) ? 30 : Math.max(10, pollInterval),
      },
      notes:
        "Use this subscription payload with a webhook relay worker that polls Sablier events and POSTs to webhookUrl.",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to prepare Sablier event subscription: ${getErrorMessage(error)}`,
    };
  }
}

export async function subscribeToStreamEventsStep(
  input: SubscribeToStreamEventsInput
): Promise<SubscribeToStreamEventsResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "sablier",
      actionName: "subscribe-to-stream-events",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

export const _integrationType = "sablier";
