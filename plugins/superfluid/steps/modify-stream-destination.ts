import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { setFlowRateCore } from "./superfluid-core";

type ModifyStreamDestinationResult =
  | {
      success: true;
      closedTransactionHash: string;
      createdTransactionHash: string;
      closedTransactionLink: string;
      createdTransactionLink: string;
    }
  | { success: false; error: string; closedTransactionHash?: string };

export type ModifyStreamDestinationInput = StepInput & {
  network: string;
  tokenAddress: string;
  currentRecipientAddress: string;
  newRecipientAddress: string;
  newFlowRate: string;
  forwarderAddress?: string;
  gasLimitMultiplier?: string;
  usePrivateMempool?: boolean;
  strict?: boolean;
};

async function stepHandler(
  input: ModifyStreamDestinationInput
): Promise<ModifyStreamDestinationResult> {
  const closeResult = await setFlowRateCore({
    network: input.network,
    tokenAddress: input.tokenAddress,
    recipientAddress: input.currentRecipientAddress,
    flowRate: "0",
    forwarderAddress: input.forwarderAddress,
    gasLimitMultiplier: input.gasLimitMultiplier,
    usePrivateMempool: input.usePrivateMempool,
    strict: input.strict,
    _context: input._context,
  });

  if (!closeResult.success) {
    return {
      success: false,
      error: `Failed to close existing stream: ${closeResult.error}`,
    };
  }

  const createResult = await setFlowRateCore({
    network: input.network,
    tokenAddress: input.tokenAddress,
    recipientAddress: input.newRecipientAddress,
    flowRate: input.newFlowRate,
    forwarderAddress: input.forwarderAddress,
    gasLimitMultiplier: input.gasLimitMultiplier,
    usePrivateMempool: input.usePrivateMempool,
    strict: input.strict,
    _context: input._context,
  });

  if (!createResult.success) {
    return {
      success: false,
      error: `Existing stream was closed, but failed to create new stream: ${createResult.error}`,
      closedTransactionHash: closeResult.transactionHash,
    };
  }

  return {
    success: true,
    closedTransactionHash: closeResult.transactionHash,
    createdTransactionHash: createResult.transactionHash,
    closedTransactionLink: closeResult.transactionLink,
    createdTransactionLink: createResult.transactionLink,
  };
}

export async function modifyStreamDestinationStep(
  input: ModifyStreamDestinationInput
): Promise<ModifyStreamDestinationResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "superfluid",
      actionName: "modify-stream-destination",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}
modifyStreamDestinationStep.maxRetries = 0;

export const _integrationType = "superfluid";
