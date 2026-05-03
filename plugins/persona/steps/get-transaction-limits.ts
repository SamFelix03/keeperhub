import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { PersonaCredentials } from "../credentials";
import { getPersonaVerificationSnapshot } from "./persona-core";

type GetTransactionLimitsResult =
  | {
      success: true;
      status: "not_started" | "pending" | "approved" | "declined";
      tier: string;
      limits: {
        daily?: string;
        monthly?: string;
      };
      raw: unknown;
    }
  | { success: false; error: string };

export type GetTransactionLimitsInput = StepInput & {
  inquiryId?: string;
  walletAddress?: string;
  email?: string;
  referenceId?: string;
  integrationId?: string;
};

async function stepHandler(
  input: GetTransactionLimitsInput,
  credentials: PersonaCredentials
): Promise<GetTransactionLimitsResult> {
  try {
    const snapshot = await getPersonaVerificationSnapshot(input, credentials);
    return {
      success: true,
      status: snapshot.status,
      tier: snapshot.tier,
      limits: snapshot.limits,
      raw: snapshot.raw,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch Persona transaction limits: ${getErrorMessage(error)}`,
    };
  }
}

export async function getTransactionLimitsStep(
  input: GetTransactionLimitsInput
): Promise<GetTransactionLimitsResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("persona/get-transaction-limits requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as PersonaCredentials;

  return withPluginMetrics(
    {
      pluginName: "persona",
      actionName: "get-transaction-limits",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
getTransactionLimitsStep.maxRetries = 0;

export const _integrationType = "persona";
