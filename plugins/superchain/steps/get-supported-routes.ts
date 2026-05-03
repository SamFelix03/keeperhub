import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { SuperchainCredentials } from "../credentials";
import { acrossGet } from "./superchain-core";

type GetSupportedRoutesResult =
  | {
      success: true;
      routes: unknown;
      count: number;
    }
  | { success: false; error: string };

export type GetSupportedRoutesInput = StepInput & {
  networkMode?: "mainnet" | "testnet";
  originChainId?: string;
  destinationChainId?: string;
  integrationId?: string;
};

async function stepHandler(
  input: GetSupportedRoutesInput,
  credentials: SuperchainCredentials
): Promise<GetSupportedRoutesResult> {
  try {
    const response = await acrossGet<unknown>(
      input.networkMode,
      "/available-routes",
      {
        originChainId: input.originChainId,
        destinationChainId: input.destinationChainId,
      },
      credentials
    );

    const routes = Array.isArray(response)
      ? response
      : Array.isArray((response as { routes?: unknown[] }).routes)
        ? (response as { routes: unknown[] }).routes
        : [];

    return {
      success: true,
      routes: routes.length > 0 ? routes : response,
      count: routes.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch supported routes: ${getErrorMessage(error)}`,
    };
  }
}

export async function getSupportedRoutesStep(
  input: GetSupportedRoutesInput
): Promise<GetSupportedRoutesResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("superchain/get-supported-routes requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as SuperchainCredentials;

  return withPluginMetrics(
    {
      pluginName: "superchain",
      actionName: "get-supported-routes",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "superchain";
