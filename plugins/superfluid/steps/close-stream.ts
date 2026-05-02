import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { setFlowRateCore } from "./superfluid-core";

type CloseStreamResult =
  | {
      success: true;
      transactionHash: string;
      transactionLink: string;
      gasUsed: string;
      gasUsedUnits: string;
      effectiveGasPrice: string;
    }
  | { success: false; error: string };

export type CloseStreamInput = StepInput & {
  network: string;
  tokenAddress: string;
  recipientAddress: string;
  forwarderAddress?: string;
  gasLimitMultiplier?: string;
  usePrivateMempool?: boolean;
  strict?: boolean;
};

async function stepHandler(input: CloseStreamInput): Promise<CloseStreamResult> {
  const result = await setFlowRateCore({
    network: input.network,
    tokenAddress: input.tokenAddress,
    recipientAddress: input.recipientAddress,
    flowRate: "0",
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

export async function closeStreamStep(
  input: CloseStreamInput
): Promise<CloseStreamResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "superfluid",
      actionName: "close-stream",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}
closeStreamStep.maxRetries = 0;

export const _integrationType = "superfluid";
