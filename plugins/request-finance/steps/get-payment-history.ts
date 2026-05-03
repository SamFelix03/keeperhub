import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { RequestFinanceCredentials } from "../credentials";
import { requestFinanceGet } from "./request-finance-core";

type RequestInvoice = {
  id: string;
  status?: string;
  requestId?: string;
  createdAt?: string;
  updatedAt?: string;
  amount?: string;
  currency?: string;
  [key: string]: unknown;
};

type GetPaymentHistoryResult =
  | {
      success: true;
      invoices: RequestInvoice[];
      count: number;
      statuses: Record<string, number>;
      raw: unknown;
    }
  | { success: false; error: string };

export type GetPaymentHistoryInput = StepInput & {
  take?: string;
  skip?: string;
  status?: string;
  search?: string;
  filterBy?: "sent" | "received";
  variant?: "rnf_invoice" | "rnf_salary";
  integrationId?: string;
};

function buildStatusCounts(invoices: RequestInvoice[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const invoice of invoices) {
    const key = (invoice.status || "unknown").toLowerCase();
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

async function stepHandler(
  input: GetPaymentHistoryInput,
  credentials: RequestFinanceCredentials
): Promise<GetPaymentHistoryResult> {
  const take = Number.parseInt(input.take ?? "25", 10);
  const skip = Number.parseInt(input.skip ?? "0", 10);

  try {
    const raw = await requestFinanceGet(
      "/invoices",
      {
        take: String(Number.isNaN(take) ? 25 : Math.min(Math.max(take, 1), 100)),
        skip: String(Number.isNaN(skip) ? 0 : Math.max(skip, 0)),
        search: input.search,
        filterBy: input.filterBy,
        variant: input.variant,
        format: "paginated",
      },
      credentials
    );

    let invoices: RequestInvoice[] = [];
    if (Array.isArray(raw)) {
      invoices = raw as RequestInvoice[];
    } else {
      const objectValue = raw as { data?: RequestInvoice[]; invoices?: RequestInvoice[] };
      if (Array.isArray(objectValue.data)) {
        invoices = objectValue.data;
      } else if (Array.isArray(objectValue.invoices)) {
        invoices = objectValue.invoices;
      }
    }

    if (input.status) {
      const targetStatuses = input.status
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
      invoices = invoices.filter((invoice) =>
        targetStatuses.includes((invoice.status || "").toLowerCase())
      );
    }

    return {
      success: true,
      invoices,
      count: invoices.length,
      statuses: buildStatusCounts(invoices),
      raw,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch Request Finance payment history: ${getErrorMessage(error)}`,
    };
  }
}

export async function getPaymentHistoryStep(
  input: GetPaymentHistoryInput
): Promise<GetPaymentHistoryResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("request-finance/get-payment-history requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as RequestFinanceCredentials;

  return withPluginMetrics(
    {
      pluginName: "request-finance",
      actionName: "get-payment-history",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "request-finance";
