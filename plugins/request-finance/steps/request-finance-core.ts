import "server-only";

import type { RequestFinanceCredentials } from "../credentials";

const FETCH_TIMEOUT_MS = 20_000;
const REQUEST_FINANCE_DEFAULT_BASE_URL = "https://api.request.finance";

export function getRequestFinanceBaseUrl(
  credentials: RequestFinanceCredentials
): string {
  return credentials.REQUEST_FINANCE_BASE_URL || REQUEST_FINANCE_DEFAULT_BASE_URL;
}

export async function requestFinanceGet(
  path: string,
  params: Record<string, string | undefined>,
  credentials: RequestFinanceCredentials
): Promise<unknown> {
  const apiKey = credentials.REQUEST_FINANCE_API_KEY;
  if (!apiKey) {
    throw new Error("REQUEST_FINANCE_API_KEY is required");
  }

  const baseUrl = getRequestFinanceBaseUrl(credentials);
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim() !== "") {
      searchParams.set(key, value);
    }
  }

  const url = `${baseUrl}${path}?${searchParams.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
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
