import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { PersonaCredentials } from "../credentials";
import { createPersonaInquiry } from "./persona-core";

type CreateInquiryResult =
  | {
      success: true;
      inquiryId?: string;
      inquiryUrl?: string;
      referenceId: string;
      raw: unknown;
    }
  | { success: false; error: string };

export type CreateInquiryInput = StepInput & {
  walletAddress?: string;
  email?: string;
  referenceId?: string;
  inquiryTemplateId?: string;
  redirectUri?: string;
  integrationId?: string;
};

async function stepHandler(
  input: CreateInquiryInput,
  credentials: PersonaCredentials
): Promise<CreateInquiryResult> {
  try {
    const result = await createPersonaInquiry(input, credentials);
    return {
      success: true,
      inquiryId: result.inquiryId,
      inquiryUrl: result.inquiryUrl,
      referenceId: result.referenceId,
      raw: result.raw,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create Persona inquiry: ${getErrorMessage(error)}`,
    };
  }
}

export async function createInquiryStep(
  input: CreateInquiryInput
): Promise<CreateInquiryResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("persona/create-inquiry requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as PersonaCredentials;

  return withPluginMetrics(
    {
      pluginName: "persona",
      actionName: "create-inquiry",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
createInquiryStep.maxRetries = 0;

export const _integrationType = "persona";
