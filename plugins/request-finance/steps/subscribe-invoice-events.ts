import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import type { RequestFinanceCredentials } from "../credentials";

type SubscribeInvoiceEventsResult =
  | {
      success: true;
      subscription: {
        provider: "request-finance";
        webhookUrl: string;
        eventTypes: string[];
        variant: "rnf_invoice" | "rnf_salary";
        walletAddress?: string;
        pollIntervalSeconds: number;
      };
      notes: string;
    }
  | { success: false; error: string };

export type SubscribeInvoiceEventsInput = StepInput & {
  webhookUrl: string;
  eventTypes?: string;
  variant?: "rnf_invoice" | "rnf_salary";
  walletAddress?: string;
  pollIntervalSeconds?: string;
  integrationId?: string;
};

async function stepHandler(
  input: SubscribeInvoiceEventsInput,
  credentials: RequestFinanceCredentials
): Promise<SubscribeInvoiceEventsResult> {
  const pollInterval = Number.parseInt(input.pollIntervalSeconds ?? "30", 10);
  const eventTypes = (input.eventTypes || "create,accept,cancel,reject,paid")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return {
    success: true,
    subscription: {
      provider: "request-finance",
      webhookUrl: input.webhookUrl,
      eventTypes,
      variant: input.variant || "rnf_invoice",
      walletAddress: input.walletAddress,
      pollIntervalSeconds: Number.isNaN(pollInterval) ? 30 : Math.max(10, pollInterval),
    },
    notes: credentials.REQUEST_FINANCE_WEBHOOK_SECRET
      ? "Use REQUEST_FINANCE_WEBHOOK_SECRET to verify the X-Webhook-Signature header from Request Finance webhook calls."
      : "Configure webhook URL and secret in Request Finance dashboard > Settings > Developer > Apps. Then verify X-Webhook-Signature in your webhook handler.",
  };
}

export async function subscribeInvoiceEventsStep(
  input: SubscribeInvoiceEventsInput
): Promise<SubscribeInvoiceEventsResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error(
      "request-finance/subscribe-invoice-events requires integrationId"
    );
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as RequestFinanceCredentials;

  return withPluginMetrics(
    {
      pluginName: "request-finance",
      actionName: "subscribe-invoice-events",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "request-finance";
