import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { PersonaCredentials } from "../credentials";
import { getPersonaVerificationSnapshot } from "./persona-core";

type GetClearedCorridorsResult =
  | {
      success: true;
      status: "not_started" | "pending" | "approved" | "declined";
      tier: string;
      corridors: string[];
      count: number;
      raw: unknown;
    }
  | { success: false; error: string };

export type GetClearedCorridorsInput = StepInput & {
  inquiryId?: string;
  walletAddress?: string;
  email?: string;
  referenceId?: string;
  integrationId?: string;
};

async function stepHandler(
  input: GetClearedCorridorsInput,
  credentials: PersonaCredentials
): Promise<GetClearedCorridorsResult> {
  try {
    const snapshot = await getPersonaVerificationSnapshot(input, credentials);
    return {
      success: true,
      status: snapshot.status,
      tier: snapshot.tier,
      corridors: snapshot.corridors,
      count: snapshot.corridors.length,
      raw: snapshot.raw,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch cleared corridors: ${getErrorMessage(error)}`,
    };
  }
}

export async function getClearedCorridorsStep(
  input: GetClearedCorridorsInput
): Promise<GetClearedCorridorsResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("persona/get-cleared-corridors requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as PersonaCredentials;

  return withPluginMetrics(
    {
      pluginName: "persona",
      actionName: "get-cleared-corridors",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
getClearedCorridorsStep.maxRetries = 0;

export const _integrationType = "persona";
