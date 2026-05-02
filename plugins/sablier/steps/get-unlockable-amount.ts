import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import {
  getSablierContract,
  parseStreamId,
  STREAM_STATUS_LABELS,
} from "./sablier-core";

type GetUnlockableAmountResult =
  | {
      success: true;
      streamId: string;
      withdrawableAmount: string;
      statusCode: number;
      status: string;
    }
  | { success: false; error: string };

export type GetUnlockableAmountInput = StepInput & {
  network: string;
  lockupContractAddress: string;
  streamId: string;
};

async function stepHandler(
  input: GetUnlockableAmountInput
): Promise<GetUnlockableAmountResult> {
  try {
    const contract = getSablierContract(input.network, input.lockupContractAddress);
    const parsedStreamId = parseStreamId(input.streamId);

    const [withdrawableAmount, statusCode] = (await Promise.all([
      contract.withdrawableAmountOf(parsedStreamId) as Promise<bigint>,
      contract.statusOf(parsedStreamId) as Promise<number>,
    ])) as [bigint, number];

    return {
      success: true,
      streamId: input.streamId,
      withdrawableAmount: withdrawableAmount.toString(),
      statusCode,
      status: STREAM_STATUS_LABELS[statusCode] || `UNKNOWN_${statusCode}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch unlockable amount: ${getErrorMessage(error)}`,
    };
  }
}

export async function getUnlockableAmountStep(
  input: GetUnlockableAmountInput
): Promise<GetUnlockableAmountResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "sablier",
      actionName: "get-unlockable-amount",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

export const _integrationType = "sablier";
