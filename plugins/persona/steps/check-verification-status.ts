import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { PersonaCredentials } from "../credentials";
import { getPersonaVerificationSnapshot } from "./persona-core";

type CheckVerificationStatusResult =
  | {
      success: true;
      status: "not_started" | "pending" | "approved" | "declined";
      tier: string;
      corridors: string[];
      limits: {
        daily?: string;
        monthly?: string;
      };
      raw: unknown;
    }
  | { success: false; error: string };

export type CheckVerificationStatusInput = StepInput & {
  inquiryId?: string;
  walletAddress?: string;
  email?: string;
  referenceId?: string;
  statusEndpoint?: string;
  integrationId?: string;
};

async function stepHandler(
  input: CheckVerificationStatusInput,
  credentials: PersonaCredentials
): Promise<CheckVerificationStatusResult> {
  try {
    const snapshot = await getPersonaVerificationSnapshot(input, credentials);
    return {
      success: true,
      status: snapshot.status,
      tier: snapshot.tier,
      corridors: snapshot.corridors,
      limits: snapshot.limits,
      raw: snapshot.raw,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to check Persona verification status: ${getErrorMessage(error)}`,
    };
  }
}

export async function checkVerificationStatusStep(
  input: CheckVerificationStatusInput
): Promise<CheckVerificationStatusResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("persona/check-verification-status requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as PersonaCredentials;

  return withPluginMetrics(
    {
      pluginName: "persona",
      actionName: "check-verification-status",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
checkVerificationStatusStep.maxRetries = 0;

export const _integrationType = "persona";
