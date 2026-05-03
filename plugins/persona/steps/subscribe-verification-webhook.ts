import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import type { PersonaCredentials } from "../credentials";

type SubscribeVerificationWebhookResult =
  | {
      success: true;
      subscription: {
        provider: "persona";
        webhookUrl: string;
        eventTypes: string[];
      };
      notes: string;
    }
  | { success: false; error: string };

export type SubscribeVerificationWebhookInput = StepInput & {
  webhookUrl: string;
  eventTypes?: string;
  integrationId?: string;
};

function parseEventTypes(raw?: string): string[] {
  return (raw || "inquiry.approved,inquiry.completed,inquiry.failed")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function stepHandler(
  input: SubscribeVerificationWebhookInput,
  credentials: PersonaCredentials
): Promise<SubscribeVerificationWebhookResult> {
  try {
    new URL(input.webhookUrl);
  } catch {
    return { success: false, error: "Invalid webhookUrl" };
  }

  const eventTypes = parseEventTypes(input.eventTypes);

  return {
    success: true,
    subscription: {
      provider: "persona",
      webhookUrl: input.webhookUrl,
      eventTypes,
    },
    notes: credentials.PERSONA_WEBHOOK_SECRET
      ? "Use PERSONA_WEBHOOK_SECRET to verify Persona webhook signatures before resuming deferred off-ramp execution."
      : "Configure webhook signing in Persona dashboard and verify HMAC-SHA256 signatures in your webhook handler before processing events.",
  };
}

export async function subscribeVerificationWebhookStep(
  input: SubscribeVerificationWebhookInput
): Promise<SubscribeVerificationWebhookResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error(
      "persona/subscribe-verification-webhook requires integrationId"
    );
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as PersonaCredentials;

  return withPluginMetrics(
    {
      pluginName: "persona",
      actionName: "subscribe-verification-webhook",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
subscribeVerificationWebhookStep.maxRetries = 0;

export const _integrationType = "persona";
