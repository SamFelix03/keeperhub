import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { OfframpCredentials } from "../credentials";
import { fetchJson, resolveEnvironmentMode } from "./offramp-core";

type GetConversionStatusResult =
  | {
      success: true;
      provider: "onramper" | "transak";
      status: string;
      details: unknown;
    }
  | { success: false; error: string };

export type GetConversionStatusInput = StepInput & {
  provider: "onramper" | "transak";
  networkMode?: "mainnet" | "testnet";
  orderId?: string;
  statusEndpoint?: string;
  integrationId?: string;
};

async function fetchTransakOrderStatus(
  input: GetConversionStatusInput,
  credentials: OfframpCredentials
): Promise<unknown> {
  if (!input.orderId) {
    throw new Error("orderId is required for Transak conversion status");
  }

  const mode = resolveEnvironmentMode(input.networkMode);
  const baseUrl =
    mode === "mainnet"
      ? "https://api-gateway.transak.com/api/v2"
      : "https://api-gateway-stg.transak.com/api/v2";

  const headers: HeadersInit = {};
  if (credentials.TRANSAK_AUTH_TOKEN) {
    headers.authorization = credentials.TRANSAK_AUTH_TOKEN;
  }
  if (credentials.TRANSAK_PARTNER_ACCESS_TOKEN) {
    headers["x-access-token"] = credentials.TRANSAK_PARTNER_ACCESS_TOKEN;
  }

  const url = `${baseUrl}/orders/${input.orderId}`;
  return fetchJson(url, { method: "GET", headers });
}

async function stepHandler(
  input: GetConversionStatusInput,
  credentials: OfframpCredentials
): Promise<GetConversionStatusResult> {
  try {
    if (input.statusEndpoint) {
      const details = await fetchJson(input.statusEndpoint, { method: "GET" });
      return {
        success: true,
        provider: input.provider,
        status: "external",
        details,
      };
    }

    if (input.provider === "transak") {
      const details = (await fetchTransakOrderStatus(
        input,
        credentials
      )) as { data?: { status?: string } };
      return {
        success: true,
        provider: "transak",
        status: details.data?.status || "unknown",
        details,
      };
    }

    return {
      success: true,
      provider: "onramper",
      status: "pending_manual",
      details: {
        message:
          "Onramper status polling requires an external status endpoint from your integration.",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch conversion status: ${getErrorMessage(error)}`,
    };
  }
}

export async function getConversionStatusStep(
  input: GetConversionStatusInput
): Promise<GetConversionStatusResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("offramp/get-conversion-status requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as OfframpCredentials;

  return withPluginMetrics(
    {
      pluginName: "offramp",
      actionName: "get-conversion-status",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "offramp";
