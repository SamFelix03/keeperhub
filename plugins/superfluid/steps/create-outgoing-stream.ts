import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { setFlowRateCore } from "./superfluid-core";

type CreateOutgoingStreamResult =
  | {
      success: true;
      transactionHash: string;
      transactionLink: string;
      gasUsed: string;
      gasUsedUnits: string;
      effectiveGasPrice: string;
    }
  | { success: false; error: string };

export type CreateOutgoingStreamInput = StepInput & {
  network: string;
  tokenAddress: string;
  recipientAddress: string;
  flowRate: string;
  forwarderAddress?: string;
  gasLimitMultiplier?: string;
  usePrivateMempool?: boolean;
  strict?: boolean;
};

async function stepHandler(
  input: CreateOutgoingStreamInput
): Promise<CreateOutgoingStreamResult> {
  const result = await setFlowRateCore({
    network: input.network,
    tokenAddress: input.tokenAddress,
    recipientAddress: input.recipientAddress,
    flowRate: input.flowRate,
    forwarderAddress: input.forwarderAddress,
    gasLimitMultiplier: input.gasLimitMultiplier,
    usePrivateMempool: input.usePrivateMempool,
    strict: input.strict,
    _context: input._context,
  });

  if (!result.success) {
    return result;
  }

  return result;
}

export async function createOutgoingStreamStep(
  input: CreateOutgoingStreamInput
): Promise<CreateOutgoingStreamResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "superfluid",
      actionName: "create-outgoing-stream",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}
createOutgoingStreamStep.maxRetries = 0;

export const _integrationType = "superfluid";
