import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import { resolveXmtpEnv, sendXmtpTextMessage } from "./xmtp-core";

type SendMessageResult =
  | {
      success: true;
      env: string;
      senderAddress: string;
      recipientAddress: string;
      conversationId: string;
      messageId?: string;
    }
  | { success: false; error: string };

export type SendMessageInput = StepInput & {
  recipientAddress: string;
  message: string;
  xmtpEnv?: string;
  xmtpDbPath?: string;
};

async function stepHandler(input: SendMessageInput): Promise<SendMessageResult> {
  const organizationId = input._context?.organizationId;
  if (!organizationId) {
    return {
      success: false,
      error: "organizationId is required in step context for XMTP messaging",
    };
  }

  try {
    const env = resolveXmtpEnv(input.xmtpEnv);
    const result = await sendXmtpTextMessage({
      organizationId,
      recipientAddress: input.recipientAddress,
      message: input.message,
      env,
      dbPath: input.xmtpDbPath,
    });

    return {
      success: true,
      env,
      senderAddress: result.senderAddress,
      recipientAddress: result.recipientAddress,
      conversationId: result.conversationId,
      messageId: result.messageId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to send XMTP message: ${getErrorMessage(error)}`,
    };
  }
}

export async function sendMessageStep(
  input: SendMessageInput
): Promise<SendMessageResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "xmtp",
      actionName: "send-message",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}
sendMessageStep.maxRetries = 0;

export const _integrationType = "xmtp";
