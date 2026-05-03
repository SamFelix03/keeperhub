import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { XmtpCredentials } from "../credentials";
import { resolveXmtpEnv, sendXmtpTextMessage } from "./xmtp-core";

type SendTransactionReceiptResult =
  | {
      success: true;
      env: string;
      senderAddress: string;
      recipientAddress: string;
      transactionHash: string;
      conversationId: string;
      messageId?: string;
    }
  | { success: false; error: string };

export type SendTransactionReceiptInput = StepInput & {
  recipientAddress: string;
  transactionHash: string;
  network: string;
  amount: string;
  token: string;
  paymentIntentId?: string;
  xmtpEnv?: string;
  xmtpDbPath?: string;
  integrationId?: string;
};

function buildReceiptMessage(input: SendTransactionReceiptInput): string {
  return JSON.stringify({
    type: "payment_receipt",
    transactionHash: input.transactionHash,
    network: input.network,
    amount: input.amount,
    token: input.token,
    paymentIntentId: input.paymentIntentId,
    timestamp: new Date().toISOString(),
  });
}

async function stepHandler(
  input: SendTransactionReceiptInput,
  credentials: XmtpCredentials
): Promise<SendTransactionReceiptResult> {
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
      message: buildReceiptMessage(input),
      env,
      dbPath: input.xmtpDbPath || credentials.XMTP_DB_PATH,
    });

    return {
      success: true,
      env,
      senderAddress: result.senderAddress,
      recipientAddress: result.recipientAddress,
      transactionHash: input.transactionHash,
      conversationId: result.conversationId,
      messageId: result.messageId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to send XMTP transaction receipt: ${getErrorMessage(error)}`,
    };
  }
}

export async function sendTransactionReceiptStep(
  input: SendTransactionReceiptInput
): Promise<SendTransactionReceiptResult> {
  "use step";
  if (!input.integrationId) {
    throw new Error("xmtp/send-transaction-receipt requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as XmtpCredentials;

  return withPluginMetrics(
    {
      pluginName: "xmtp",
      actionName: "send-transaction-receipt",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
sendTransactionReceiptStep.maxRetries = 0;

export const _integrationType = "xmtp";
