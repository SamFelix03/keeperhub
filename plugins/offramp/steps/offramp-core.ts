import "server-only";

import type { OfframpCredentials } from "../credentials";

const FETCH_TIMEOUT_MS = 20_000;

const ONRAMPER_BASE_URLS = {
  mainnet: "https://api.onramper.com",
  testnet: "https://api-stg.onramper.com",
} as const;

const TRANSAK_BASE_URLS = {
  mainnet: "https://api-gateway.transak.com/api/v2",
  testnet: "https://api-gateway-stg.transak.com/api/v2",
} as const;

export function resolveEnvironmentMode(mode?: string): "mainnet" | "testnet" {
  return mode === "mainnet" ? "mainnet" : "testnet";
}

export async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    if (!text) {
      return {};
    }

    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOnramperQuote(params: {
  mode: "mainnet" | "testnet";
  fiatCurrency: string;
  cryptoCurrency: string;
  amount?: string;
  countryCode?: string;
  paymentMethod?: string;
  credentials: OfframpCredentials;
}): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params.amount) {
    qs.set("amount", params.amount);
  }
  if (params.countryCode) {
    qs.set("country", params.countryCode.toLowerCase());
  }
  if (params.paymentMethod) {
    qs.set("paymentMethod", params.paymentMethod);
  }
  qs.set("type", "sell");

  const baseUrl = ONRAMPER_BASE_URLS[params.mode];
  const url = `${baseUrl}/quotes/${params.fiatCurrency.toUpperCase()}/${params.cryptoCurrency.toUpperCase()}?${qs.toString()}`;

  const headers: HeadersInit = {};
  if (params.credentials.ONRAMPER_API_KEY) {
    headers.Authorization = params.credentials.ONRAMPER_API_KEY;
  }

  return fetchJson(url, { method: "GET", headers });
}

export async function getTransakQuote(params: {
  mode: "mainnet" | "testnet";
  fiatCurrency: string;
  cryptoCurrency: string;
  amount?: string;
  network?: string;
  paymentMethod?: string;
  isBuyOrSell?: "BUY" | "SELL";
  countryCode?: string;
  credentials: OfframpCredentials;
}): Promise<unknown> {
  const apiKey = params.credentials.TRANSAK_API_KEY;
  if (!apiKey) {
    throw new Error("TRANSAK_API_KEY is required for Transak quote requests");
  }

  const qs = new URLSearchParams();
  qs.set("apiKey", apiKey);
  qs.set("fiatCurrency", params.fiatCurrency.toUpperCase());
  qs.set("cryptoCurrency", params.cryptoCurrency.toUpperCase());
  qs.set("isBuyOrSell", params.isBuyOrSell || "SELL");
  if (params.network) {
    qs.set("network", params.network);
  }
  if (params.paymentMethod) {
    qs.set("paymentMethod", params.paymentMethod);
  }
  if (params.amount) {
    qs.set("fiatAmount", params.amount);
  }
  if (params.countryCode) {
    qs.set("quoteCountryCode", params.countryCode.toUpperCase());
  }

  const baseUrl = TRANSAK_BASE_URLS[params.mode];
  const url = `${baseUrl}/lookup/quotes?${qs.toString()}`;

  return fetchJson(url, { method: "GET" });
}

export async function getOnramperSupported(params: {
  mode: "mainnet" | "testnet";
  countryCode?: string;
  credentials: OfframpCredentials;
}): Promise<unknown> {
  const qs = new URLSearchParams();
  qs.set("type", "sell");
  if (params.countryCode) {
    qs.set("country", params.countryCode.toLowerCase());
  }

  const headers: HeadersInit = {};
  if (params.credentials.ONRAMPER_API_KEY) {
    headers.Authorization = params.credentials.ONRAMPER_API_KEY;
  }

  const baseUrl = ONRAMPER_BASE_URLS[params.mode];
  const url = `${baseUrl}/supported?${qs.toString()}`;
  return fetchJson(url, { method: "GET", headers });
}

export async function getTransakFiatCurrencies(params: {
  mode: "mainnet" | "testnet";
  credentials: OfframpCredentials;
}): Promise<unknown> {
  const apiKey = params.credentials.TRANSAK_API_KEY;
  if (!apiKey) {
    throw new Error("TRANSAK_API_KEY is required for Transak corridor requests");
  }

  const qs = new URLSearchParams();
  qs.set("apiKey", apiKey);

  const baseUrl = TRANSAK_BASE_URLS[params.mode];
  const url = `${baseUrl}/lookup/currencies/fiat-currencies?${qs.toString()}`;
  return fetchJson(url, { method: "GET" });
}
