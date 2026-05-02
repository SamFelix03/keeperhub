import "server-only";

import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import { fetchJson } from "./offramp-core";

const COINGECKO_IDS: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  ETH: "ethereum",
  BTC: "bitcoin",
};

type RatePoint = {
  timestamp: number;
  price: number;
};

type GetRateHistoryResult =
  | {
      success: true;
      source: "coingecko";
      cryptoCurrency: string;
      fiatCurrency: string;
      points: RatePoint[];
      count: number;
    }
  | { success: false; error: string };

export type GetRateHistoryInput = StepInput & {
  cryptoCurrency: string;
  fiatCurrency: string;
  days?: string;
};

type CoinGeckoChartResponse = {
  prices?: Array<[number, number]>;
};

async function stepHandler(
  input: GetRateHistoryInput
): Promise<GetRateHistoryResult> {
  const tokenId = COINGECKO_IDS[input.cryptoCurrency.toUpperCase()];
  if (!tokenId) {
    return {
      success: false,
      error: `Unsupported cryptoCurrency for rate history: ${input.cryptoCurrency}`,
    };
  }

  const days = Number.parseInt(input.days ?? "7", 10);
  const resolvedDays = Number.isNaN(days) ? 7 : Math.min(Math.max(days, 1), 90);

  const url = `https://api.coingecko.com/api/v3/coins/${tokenId}/market_chart?vs_currency=${input.fiatCurrency.toLowerCase()}&days=${resolvedDays}`;

  try {
    const response = (await fetchJson(url, { method: "GET" })) as CoinGeckoChartResponse;
    const points = (response.prices || []).map(([timestamp, price]) => ({
      timestamp,
      price,
    }));

    return {
      success: true,
      source: "coingecko",
      cryptoCurrency: input.cryptoCurrency.toUpperCase(),
      fiatCurrency: input.fiatCurrency.toUpperCase(),
      points,
      count: points.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch rate history: ${getErrorMessage(error)}`,
    };
  }
}

export async function getRateHistoryStep(
  input: GetRateHistoryInput
): Promise<GetRateHistoryResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "offramp",
      actionName: "get-rate-history",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

export const _integrationType = "offramp";
