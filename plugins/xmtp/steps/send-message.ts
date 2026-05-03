import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { XmtpCredentials } from "../credentials";
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
  integrationId?: string;
};

async function stepHandler(
  input: SendMessageInput,
  credentials: XmtpCredentials
): Promise<SendMessageResult> {
  const organizationId = input._context?.organizationId;
  if (!organizationId) {
    return {
      success: false,
      error: "organizationId is required in step context for XMTP messaging",
    };
  }

  try {
    const env = resolveXmtpEnv(input.xmtpEnv || credentials.XMTP_ENV);
    const result = await sendXmtpTextMessage({
      organizationId,
      recipientAddress: input.recipientAddress,
      message: input.message,
      env,
      dbPath: input.xmtpDbPath || credentials.XMTP_DB_PATH,
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
  if (!input.integrationId) {
    throw new Error("xmtp/send-message requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as XmtpCredentials;

  return withPluginMetrics(
    {
      pluginName: "xmtp",
      actionName: "send-message",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
sendMessageStep.maxRetries = 0;

export const _integrationType = "xmtp";
