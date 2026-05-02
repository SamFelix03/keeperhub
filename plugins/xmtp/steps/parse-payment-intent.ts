import "server-only";

import { ethers } from "ethers";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";

type ParsedPaymentIntent = {
  type: "payment";
  amount: number;
  token: string;
  chain: string;
  recipient: string;
  note?: string;
};

type ParsePaymentIntentResult =
  | {
      success: true;
      isValid: true;
      senderAddress?: string;
      intent: ParsedPaymentIntent;
      raw: unknown;
    }
  | {
      success: false;
      isValid: false;
      error: string;
      senderAddress?: string;
      raw?: unknown;
    };

export type ParsePaymentIntentInput = StepInput & {
  messageBody: string;
  senderAddress?: string;
  messageSignature?: string;
  signaturePayload?: string;
};

function parseJsonPayload(payload: string): unknown {
  return JSON.parse(payload) as unknown;
}

function parseIntent(value: unknown): ParsedPaymentIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Payment intent payload must be a JSON object");
  }

  const input = value as Record<string, unknown>;
  if (input.type !== "payment") {
    throw new Error('Payment intent type must equal "payment"');
  }

  const amountRaw = input.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment intent amount must be a positive number");
  }

  const token = typeof input.token === "string" ? input.token.trim() : "";
  const chain = typeof input.chain === "string" ? input.chain.trim() : "";
  const recipient =
    typeof input.recipient === "string" ? input.recipient.trim() : "";

  if (!(token && chain && recipient)) {
    throw new Error("Payment intent must include token, chain, and recipient");
  }

  if (!ethers.isAddress(recipient)) {
    throw new Error("Payment intent recipient must be a valid EVM address");
  }

  const note = typeof input.note === "string" ? input.note : undefined;

  return {
    type: "payment",
    amount,
    token,
    chain,
    recipient: ethers.getAddress(recipient),
    note,
  };
}

function verifySenderSignature(params: {
  messageBody: string;
  messageSignature?: string;
  signaturePayload?: string;
  expectedSenderAddress?: string;
}): string | undefined {
  if (!params.messageSignature) {
    return params.expectedSenderAddress
      ? ethers.getAddress(params.expectedSenderAddress)
      : undefined;
  }

  const payload = params.signaturePayload || params.messageBody;
  const recovered = ethers.verifyMessage(payload, params.messageSignature);

  if (
    params.expectedSenderAddress &&
    ethers.getAddress(params.expectedSenderAddress) !==
      ethers.getAddress(recovered)
  ) {
    throw new Error("Sender signature does not match senderAddress");
  }

  return ethers.getAddress(recovered);
}

async function stepHandler(
  input: ParsePaymentIntentInput
): Promise<ParsePaymentIntentResult> {
  try {
    const parsedPayload = parseJsonPayload(input.messageBody);
    const senderAddress = verifySenderSignature({
      messageBody: input.messageBody,
      messageSignature: input.messageSignature,
      signaturePayload: input.signaturePayload,
      expectedSenderAddress: input.senderAddress,
    });
    const intent = parseIntent(parsedPayload);

    return {
      success: true,
      isValid: true,
      senderAddress,
      intent,
      raw: parsedPayload,
    };
  } catch (error) {
    return {
      success: false,
      isValid: false,
      senderAddress: input.senderAddress,
      error: `Failed to parse payment intent: ${getErrorMessage(error)}`,
    };
  }
}

export async function parsePaymentIntentStep(
  input: ParsePaymentIntentInput
): Promise<ParsePaymentIntentResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "xmtp",
      actionName: "parse-payment-intent",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}
parsePaymentIntentStep.maxRetries = 0;

export const _integrationType = "xmtp";
