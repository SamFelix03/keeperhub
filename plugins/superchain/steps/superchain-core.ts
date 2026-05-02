import "server-only";

import type { SuperchainCredentials } from "../credentials";

const FETCH_TIMEOUT_MS = 20_000;

const ACROSS_MAINNET_API = "https://app.across.to/api";
const ACROSS_TESTNET_API = "https://testnet.across.to/api";

export function getAcrossBaseUrl(
  mode: string | undefined,
  credentials: SuperchainCredentials
): string {
  if (credentials.ACROSS_API_BASE_URL) {
    return credentials.ACROSS_API_BASE_URL;
  }

  if (mode === "testnet") {
    return ACROSS_TESTNET_API;
  }

  return ACROSS_MAINNET_API;
}

function buildHeaders(credentials: SuperchainCredentials): HeadersInit {
  if (credentials.ACROSS_API_KEY) {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.ACROSS_API_KEY}`,
    };
  }

  return {
    Accept: "application/json",
  };
}

export async function acrossGet<T>(
  mode: string | undefined,
  path: string,
  params: Record<string, string | undefined>,
  credentials: SuperchainCredentials
): Promise<T> {
  const baseUrl = getAcrossBaseUrl(mode, credentials);
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim() !== "") {
      searchParams.set(key, value);
    }
  }

  if (credentials.ACROSS_INTEGRATOR_ID && !searchParams.has("integratorId")) {
    searchParams.set("integratorId", credentials.ACROSS_INTEGRATOR_ID);
  }

  const url = `${baseUrl}${path}?${searchParams.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(credentials),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Across API request failed with HTTP ${response.status}: ${text}`);
    }

    if (!text) {
      throw new Error("Across API returned an empty response");
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}
