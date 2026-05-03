import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { OfframpCredentials } from "../credentials";
import {
  getOnramperQuote,
  getTransakQuote,
  resolveEnvironmentMode,
} from "./offramp-core";

type RankedQuote = {
  provider: "onramper" | "transak";
  estimatedReceive?: number;
  payload: unknown;
};

type GetBestQuoteResult =
  | {
      success: true;
      bestQuote: RankedQuote;
      quotes: RankedQuote[];
      count: number;
    }
  | { success: false; error: string };

export type GetBestQuoteInput = StepInput & {
  providerMode?: "auto" | "onramper" | "transak";
  networkMode?: "mainnet" | "testnet";
  fiatCurrency: string;
  cryptoCurrency: string;
  amount: string;
  countryCode?: string;
  paymentMethod?: string;
  network?: string;
  integrationId?: string;
};

function estimateReceiveAmount(provider: string, payload: unknown): number | undefined {
  if (provider === "transak") {
    const p = payload as { data?: { cryptoAmount?: number; fiatAmount?: number } };
    if (typeof p.data?.fiatAmount === "number") {
      return p.data.fiatAmount;
    }
    if (typeof p.data?.cryptoAmount === "number") {
      return p.data.cryptoAmount;
    }
    return;
  }

  const onramperArray = payload as Array<{ amountOut?: number; fiatAmount?: number }>;
  if (Array.isArray(onramperArray) && onramperArray[0]) {
    if (typeof onramperArray[0].fiatAmount === "number") {
      return onramperArray[0].fiatAmount;
    }
    if (typeof onramperArray[0].amountOut === "number") {
      return onramperArray[0].amountOut;
    }
  }
  return;
}

async function stepHandler(
  input: GetBestQuoteInput,
  credentials: OfframpCredentials
): Promise<GetBestQuoteResult> {
  const mode = resolveEnvironmentMode(input.networkMode);
  const providerMode = input.providerMode || "auto";
  const quotes: RankedQuote[] = [];

  try {
    if (providerMode === "auto" || providerMode === "onramper") {
      try {
        const payload = await getOnramperQuote({
          mode,
          fiatCurrency: input.fiatCurrency,
          cryptoCurrency: input.cryptoCurrency,
          amount: input.amount,
          countryCode: input.countryCode,
          paymentMethod: input.paymentMethod,
          credentials,
        });
        quotes.push({
          provider: "onramper",
          estimatedReceive: estimateReceiveAmount("onramper", payload),
          payload,
        });
      } catch {
        // Continue to other providers in auto mode.
      }
    }

    if (providerMode === "auto" || providerMode === "transak") {
      try {
        const payload = await getTransakQuote({
          mode,
          fiatCurrency: input.fiatCurrency,
          cryptoCurrency: input.cryptoCurrency,
          amount: input.amount,
          network: input.network,
          paymentMethod: input.paymentMethod,
          countryCode: input.countryCode,
          isBuyOrSell: "SELL",
          credentials,
        });
        quotes.push({
          provider: "transak",
          estimatedReceive: estimateReceiveAmount("transak", payload),
          payload,
        });
      } catch {
        // Continue to best available provider.
      }
    }

    if (quotes.length === 0) {
      return {
        success: false,
        error:
          "No quote provider returned a result. Check provider API keys and corridor parameters.",
      };
    }

    const ranked = [...quotes].sort((a, b) => (b.estimatedReceive || 0) - (a.estimatedReceive || 0));
    return {
      success: true,
      bestQuote: ranked[0] as RankedQuote,
      quotes: ranked,
      count: ranked.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch best quote: ${getErrorMessage(error)}`,
    };
  }
}

export async function getBestQuoteStep(
  input: GetBestQuoteInput
): Promise<GetBestQuoteResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("offramp/get-best-quote requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as OfframpCredentials;

  return withPluginMetrics(
    {
      pluginName: "offramp",
      actionName: "get-best-quote",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "offramp";
