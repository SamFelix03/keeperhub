import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { OfframpCredentials } from "../credentials";
import {
  getOnramperSupported,
  getTransakFiatCurrencies,
  resolveEnvironmentMode,
} from "./offramp-core";

type GetSupportedCorridorsResult =
  | {
      success: true;
      providers: Array<{
        provider: "onramper" | "transak";
        data: unknown;
      }>;
      count: number;
    }
  | { success: false; error: string };

export type GetSupportedCorridorsInput = StepInput & {
  providerMode?: "auto" | "onramper" | "transak";
  networkMode?: "mainnet" | "testnet";
  countryCode?: string;
  integrationId?: string;
};

async function stepHandler(
  input: GetSupportedCorridorsInput,
  credentials: OfframpCredentials
): Promise<GetSupportedCorridorsResult> {
  const mode = resolveEnvironmentMode(input.networkMode);
  const providerMode = input.providerMode || "auto";
  const providers: Array<{ provider: "onramper" | "transak"; data: unknown }> = [];

  try {
    if (providerMode === "auto" || providerMode === "onramper") {
      try {
        const data = await getOnramperSupported({
          mode,
          countryCode: input.countryCode,
          credentials,
        });
        providers.push({ provider: "onramper", data });
      } catch {
        // Continue with remaining providers.
      }
    }

    if (providerMode === "auto" || providerMode === "transak") {
      try {
        const data = await getTransakFiatCurrencies({
          mode,
          credentials,
        });
        providers.push({ provider: "transak", data });
      } catch {
        // Continue with remaining providers.
      }
    }

    if (providers.length === 0) {
      return {
        success: false,
        error:
          "No provider corridor data available. Check API keys and provider availability.",
      };
    }

    return {
      success: true,
      providers,
      count: providers.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch supported corridors: ${getErrorMessage(error)}`,
    };
  }
}

export async function getSupportedCorridorsStep(
  input: GetSupportedCorridorsInput
): Promise<GetSupportedCorridorsResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("offramp/get-supported-corridors requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as OfframpCredentials;

  return withPluginMetrics(
    {
      pluginName: "offramp",
      actionName: "get-supported-corridors",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "offramp";
