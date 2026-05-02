import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { SuperchainCredentials } from "../credentials";
import { acrossGet } from "./superchain-core";

type AcrossSwapPayload = {
  approvalTxns?: unknown[];
  swapTx?: unknown;
  expectedFillTime?: number;
  quoteExpiryTimestamp?: number;
  id?: string;
  [key: string]: unknown;
};

type InitiateTransferResult =
  | {
      success: true;
      prepared: true;
      approvalTxns: unknown[];
      swapTx: unknown;
      expectedFillTime?: number;
      quoteExpiryTimestamp?: number;
      quoteId?: string;
      notes: string;
    }
  | { success: false; error: string };

export type InitiateTransferInput = StepInput & {
  networkMode?: "mainnet" | "testnet";
  tradeType?: "exactInput" | "minOutput";
  originChainId: string;
  destinationChainId: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  depositor: string;
  recipient?: string;
  slippage?: string;
  integratorId?: string;
  integrationId?: string;
};

async function stepHandler(
  input: InitiateTransferInput,
  credentials: SuperchainCredentials
): Promise<InitiateTransferResult> {
  try {
    const payload = await acrossGet<AcrossSwapPayload>(
      input.networkMode,
      "/swap/approval",
      {
        tradeType: input.tradeType || "exactInput",
        originChainId: input.originChainId,
        destinationChainId: input.destinationChainId,
        inputToken: input.inputToken,
        outputToken: input.outputToken,
        amount: input.amount,
        depositor: input.depositor,
        recipient: input.recipient || input.depositor,
        slippage: input.slippage,
        integratorId: input.integratorId,
      },
      credentials
    );

    if (!payload.swapTx) {
      return {
        success: false,
        error: "Across API did not return swap transaction payload",
      };
    }

    return {
      success: true,
      prepared: true,
      approvalTxns: Array.isArray(payload.approvalTxns) ? payload.approvalTxns : [],
      swapTx: payload.swapTx,
      expectedFillTime: payload.expectedFillTime,
      quoteExpiryTimestamp: payload.quoteExpiryTimestamp,
      quoteId: payload.id,
      notes:
        "Transfer payload prepared. Execute approvalTxns and swapTx using web3 transaction actions.",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initiate transfer: ${getErrorMessage(error)}`,
    };
  }
}

export async function initiateTransferStep(
  input: InitiateTransferInput
): Promise<InitiateTransferResult> {
  "use step";

  const credentials = input.integrationId
    ? ((await fetchCredentials(input.integrationId)) as SuperchainCredentials)
    : {};

  return withPluginMetrics(
    {
      pluginName: "superchain",
      actionName: "initiate-transfer",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
initiateTransferStep.maxRetries = 0;

export const _integrationType = "superchain";
