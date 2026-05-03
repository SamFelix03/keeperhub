import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { SuperchainCredentials } from "../credentials";
import { acrossGet } from "./superchain-core";

type PollTransferStatusResult =
  | {
      success: true;
      status: string;
      details: unknown;
      fillTxnRef?: string;
      destinationChainId?: number;
      originChainId?: number;
      depositId?: number;
    }
  | { success: false; error: string };

export type PollTransferStatusInput = StepInput & {
  networkMode?: "mainnet" | "testnet";
  depositTxnRef?: string;
  originChainId?: string;
  depositId?: string;
  integrationId?: string;
};

type DepositStatusResponse = {
  status?: string;
  fillTxnRef?: string;
  destinationChainId?: number;
  originChainId?: number;
  depositId?: number;
  [key: string]: unknown;
};

async function stepHandler(
  input: PollTransferStatusInput,
  credentials: SuperchainCredentials
): Promise<PollTransferStatusResult> {
  if (!(input.depositTxnRef || (input.originChainId && input.depositId))) {
    return {
      success: false,
      error:
        "Provide either depositTxnRef OR both originChainId and depositId to poll transfer status",
    };
  }

  try {
    const details = await acrossGet<DepositStatusResponse>(
      input.networkMode,
      "/deposit/status",
      {
        depositTxnRef: input.depositTxnRef,
        originChainId: input.originChainId,
        depositId: input.depositId,
      },
      credentials
    );

    return {
      success: true,
      status: details.status || "unknown",
      details,
      fillTxnRef: details.fillTxnRef,
      destinationChainId: details.destinationChainId,
      originChainId: details.originChainId,
      depositId: details.depositId,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    if (
      message.includes("DepositNotFoundException") ||
      message.includes("Deposit not found")
    ) {
      return {
        success: true,
        status: "pending_indexing",
        details: {
          message:
            "Deposit submitted but not yet indexed by Across status endpoint. Retry polling shortly.",
        },
      };
    }
    return {
      success: false,
      error: `Failed to poll transfer status: ${message}`,
    };
  }
}

export async function pollTransferStatusStep(
  input: PollTransferStatusInput
): Promise<PollTransferStatusResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("superchain/poll-transfer-status requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as SuperchainCredentials;

  return withPluginMetrics(
    {
      pluginName: "superchain",
      actionName: "poll-transfer-status",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "superchain";
