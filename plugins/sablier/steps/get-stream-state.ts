import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import {
  getSablierContract,
  parseStreamId,
  safeRead,
  STREAM_STATUS_LABELS,
} from "./sablier-core";

type GetStreamStateResult =
  | {
      success: true;
      streamId: string;
      statusCode?: number;
      status?: string;
      depositedAmount?: string;
      withdrawnAmount?: string;
      refundedAmount?: string;
      remainingAmount?: string;
      unlockableAmount?: string;
      sender?: string;
      recipient?: string;
      startTime?: string;
      endTime?: string;
    }
  | { success: false; error: string };

export type GetStreamStateInput = StepInput & {
  network: string;
  lockupContractAddress: string;
  streamId: string;
};

async function stepHandler(
  input: GetStreamStateInput
): Promise<GetStreamStateResult> {
  try {
    const contract = getSablierContract(input.network, input.lockupContractAddress);
    const parsedStreamId = parseStreamId(input.streamId);

    const [
      statusCode,
      unlockableAmount,
      depositedAmount,
      withdrawnAmount,
      refundedAmount,
      sender,
      recipient,
      startTime,
      endTime,
    ] = await Promise.all([
      safeRead(async () => (await contract.statusOf(parsedStreamId)) as number),
      safeRead(
        async () => (await contract.withdrawableAmountOf(parsedStreamId)) as bigint
      ),
      safeRead(async () => (await contract.getDepositedAmount(parsedStreamId)) as bigint),
      safeRead(async () => (await contract.getWithdrawnAmount(parsedStreamId)) as bigint),
      safeRead(async () => (await contract.getRefundedAmount(parsedStreamId)) as bigint),
      safeRead(async () => (await contract.getSender(parsedStreamId)) as string),
      safeRead(async () => (await contract.getRecipient(parsedStreamId)) as string),
      safeRead(async () => (await contract.getStartTime(parsedStreamId)) as bigint),
      safeRead(async () => (await contract.getEndTime(parsedStreamId)) as bigint),
    ]);

    let remainingAmount: string | undefined;
    if (
      typeof depositedAmount === "bigint" &&
      typeof withdrawnAmount === "bigint" &&
      typeof refundedAmount === "bigint"
    ) {
      remainingAmount = (depositedAmount - withdrawnAmount - refundedAmount).toString();
    }

    return {
      success: true,
      streamId: input.streamId,
      statusCode,
      status:
        typeof statusCode === "number"
          ? STREAM_STATUS_LABELS[statusCode] || `UNKNOWN_${statusCode}`
          : undefined,
      depositedAmount: depositedAmount?.toString(),
      withdrawnAmount: withdrawnAmount?.toString(),
      refundedAmount: refundedAmount?.toString(),
      remainingAmount,
      unlockableAmount: unlockableAmount?.toString(),
      sender,
      recipient,
      startTime: startTime?.toString(),
      endTime: endTime?.toString(),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch stream state: ${getErrorMessage(error)}`,
    };
  }
}

export async function getStreamStateStep(
  input: GetStreamStateInput
): Promise<GetStreamStateResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "sablier",
      actionName: "get-stream-state",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

export const _integrationType = "sablier";
