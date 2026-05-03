import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import type { OfframpCredentials } from "../credentials";
import { resolveEnvironmentMode } from "./offramp-core";

type TriggerConversionResult =
  | {
      success: true;
      provider: "onramper" | "transak";
      status: "initiated";
      conversionReference: string;
      redirectUrl?: string;
      payload: Record<string, unknown>;
      notes: string;
    }
  | { success: false; error: string };

export type TriggerConversionInput = StepInput & {
  provider: "onramper" | "transak";
  networkMode?: "mainnet" | "testnet";
  fiatCurrency: string;
  cryptoCurrency: string;
  amount: string;
  network?: string;
  countryCode?: string;
  paymentMethod?: string;
  walletAddress?: string;
  integrationId?: string;
};

function buildOnramperRedirectUrl(input: TriggerConversionInput): string {
  const params = new URLSearchParams({
    sell_defaultFiat: input.fiatCurrency.toUpperCase(),
    sell_defaultCrypto: input.cryptoCurrency.toUpperCase(),
    sell_defaultAmount: input.amount,
    sell_isAmountEditable: "false",
  });

  if (input.countryCode) {
    params.set("country", input.countryCode.toLowerCase());
  }
  if (input.paymentMethod) {
    params.set("sell_defaultPaymentMethod", input.paymentMethod);
  }
  if (input.network) {
    params.set("sell_onlyCryptoNetworks", input.network);
  }

  return `https://buy.onramper.com?${params.toString()}`;
}

function buildTransakPayload(
  input: TriggerConversionInput,
  credentials: OfframpCredentials
): Record<string, unknown> {
  return {
    apiKey: credentials.TRANSAK_API_KEY,
    referrerDomain: credentials.TRANSAK_REFERRER_DOMAIN,
    productsAvailed: "SELL",
    fiatCurrency: input.fiatCurrency.toUpperCase(),
    cryptoCurrencyCode: input.cryptoCurrency.toUpperCase(),
    cryptoAmount: input.amount,
    network: input.network,
    countryCode: input.countryCode?.toUpperCase(),
    paymentMethod: input.paymentMethod,
    walletAddress: input.walletAddress,
    environment: resolveEnvironmentMode(input.networkMode).toUpperCase(),
  };
}

async function stepHandler(
  input: TriggerConversionInput,
  credentials: OfframpCredentials
): Promise<TriggerConversionResult> {
  const conversionReference = `offramp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (input.provider === "onramper") {
    return {
      success: true,
      provider: "onramper",
      status: "initiated",
      conversionReference,
      redirectUrl: buildOnramperRedirectUrl(input),
      payload: {
        amount: input.amount,
        fiatCurrency: input.fiatCurrency.toUpperCase(),
        cryptoCurrency: input.cryptoCurrency.toUpperCase(),
      },
      notes:
        "Use redirectUrl to open the off-ramp flow. Keep conversionReference for downstream tracking.",
    };
  }

  return {
    success: true,
    provider: "transak",
    status: "initiated",
    conversionReference,
    payload: buildTransakPayload(input, credentials),
    notes:
      "Use the payload with Transak Create Widget URL API on your backend to start the SELL flow.",
  };
}

export async function triggerConversionStep(
  input: TriggerConversionInput
): Promise<TriggerConversionResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("offramp/trigger-conversion requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as OfframpCredentials;

  return withPluginMetrics(
    {
      pluginName: "offramp",
      actionName: "trigger-conversion",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
triggerConversionStep.maxRetries = 0;

export const _integrationType = "offramp";
