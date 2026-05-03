import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { XmtpCredentials } from "../credentials";
import { createXmtpClientForOrganization, resolveXmtpEnv } from "./xmtp-core";

type SubscribeToInboxResult =
  | {
      success: true;
      subscription: {
        provider: "xmtp";
        env: string;
        senderAddress?: string;
        webhookUrl: string;
        whitelistSenders: string[];
        pollIntervalSeconds: number;
      };
      notes: string;
    }
  | { success: false; error: string };

export type SubscribeToInboxInput = StepInput & {
  webhookUrl: string;
  whitelistSenders?: string;
  pollIntervalSeconds?: string;
  xmtpEnv?: string;
  xmtpDbPath?: string;
  integrationId?: string;
};

function parseWhitelist(raw?: string): string[] {
  return (raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function stepHandler(
  input: SubscribeToInboxInput,
  credentials: XmtpCredentials
): Promise<SubscribeToInboxResult> {
  try {
    new URL(input.webhookUrl);
  } catch {
    return { success: false, error: "Invalid webhookUrl" };
  }

  const whitelistSenders = parseWhitelist(input.whitelistSenders);
  const pollInterval = Number.parseInt(input.pollIntervalSeconds ?? "30", 10);
  const env = resolveXmtpEnv(input.xmtpEnv || credentials.XMTP_ENV);

  let senderAddress: string | undefined;
  const organizationId = input._context?.organizationId;

  if (organizationId) {
    try {
      const xmtp = await createXmtpClientForOrganization({
        organizationId,
        env,
        dbPath: input.xmtpDbPath || credentials.XMTP_DB_PATH,
      });
      senderAddress = xmtp.senderAddress;
    } catch (error) {
      return {
        success: false,
        error: `Failed to initialize XMTP listener context: ${getErrorMessage(error)}`,
      };
    }
  }

  return {
    success: true,
    subscription: {
      provider: "xmtp",
      env,
      senderAddress,
      webhookUrl: input.webhookUrl,
      whitelistSenders,
      pollIntervalSeconds: Number.isNaN(pollInterval)
        ? 30
        : Math.max(10, pollInterval),
    },
    notes:
      "Use this subscription payload with a long-lived worker that streams XMTP inbox messages and POSTs matching payment intents to webhookUrl.",
  };
}

export async function subscribeToInboxStep(
  input: SubscribeToInboxInput
): Promise<SubscribeToInboxResult> {
  "use step";
  if (!input.integrationId) {
    throw new Error("xmtp/subscribe-to-inbox requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as XmtpCredentials;

  return withPluginMetrics(
    {
      pluginName: "xmtp",
      actionName: "subscribe-to-inbox",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
subscribeToInboxStep.maxRetries = 0;

export const _integrationType = "xmtp";
