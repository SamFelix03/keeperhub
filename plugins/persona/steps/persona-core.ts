import "server-only";

import type { PersonaCredentials } from "../credentials";

const PERSONA_DEFAULT_BASE_URL = "https://withpersona.com/api/v1";
const FETCH_TIMEOUT_MS = 20_000;

export type PersonaVerificationStatus =
  | "not_started"
  | "pending"
  | "approved"
  | "declined";

export type PersonaVerificationSnapshot = {
  status: PersonaVerificationStatus;
  tier: string;
  corridors: string[];
  limits: {
    daily?: string;
    monthly?: string;
  };
  raw: unknown;
};

type PersonaCheckInput = {
  inquiryId?: string;
  walletAddress?: string;
  email?: string;
  referenceId?: string;
  statusEndpoint?: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeStatus(value: string | undefined): PersonaVerificationStatus {
  const normalized = (value || "").toLowerCase();
  if (
    normalized === "approved" ||
    normalized === "completed" ||
    normalized === "passed" ||
    normalized === "success"
  ) {
    return "approved";
  }
  if (
    normalized === "declined" ||
    normalized === "failed" ||
    normalized === "rejected"
  ) {
    return "declined";
  }
  if (
    normalized === "pending" ||
    normalized === "in_progress" ||
    normalized === "created" ||
    normalized === "initiated" ||
    normalized === "needs_review"
  ) {
    return "pending";
  }
  return "not_started";
}

function pickReferenceId(input: PersonaCheckInput): string | undefined {
  return input.referenceId || input.walletAddress || input.email;
}

function ensureApiKey(credentials: PersonaCredentials): string {
  const apiKey = credentials.PERSONA_API_KEY;
  if (!apiKey) {
    throw new Error("PERSONA_API_KEY is required");
  }
  return apiKey;
}

function resolveUrl(pathOrUrl: string, credentials: PersonaCredentials): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  const baseUrl = credentials.PERSONA_BASE_URL || PERSONA_DEFAULT_BASE_URL;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
}

export async function personaRequest(
  pathOrUrl: string,
  init: RequestInit,
  credentials: PersonaCredentials
): Promise<unknown> {
  const apiKey = ensureApiKey(credentials);
  const url = resolveUrl(pathOrUrl, credentials);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    };

    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text.trim().length > 0 ? (JSON.parse(text) as unknown) : {};

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractVerificationSnapshot(
  payload: unknown
): PersonaVerificationSnapshot {
  const root = asObject(payload) || {};
  const data = root.data;
  const firstData =
    (asArray(data)[0] as Record<string, unknown> | undefined) ||
    (asObject(data) ?? null) ||
    {};
  const attributes = asObject(firstData.attributes) || {};
  const metadata = asObject(attributes.metadata) || {};
  const limitsObj =
    asObject(attributes["transaction-limits"]) ||
    asObject(attributes.transactionLimits) ||
    asObject(metadata.transactionLimits) ||
    {};

  const statusRaw =
    asString(attributes.status) ||
    asString(attributes["verification-status"]) ||
    asString(metadata.status) ||
    asString(root.status);

  const tier =
    asString(attributes["verification-tier"]) ||
    asString(attributes.tier) ||
    asString(metadata.tier) ||
    asString(attributes["inquiry-template-id"]) ||
    "unknown";

  const rawA = asArray(attributes["cleared-corridors"]);
  const rawB = asArray(attributes.clearedCorridors);
  const rawC = asArray(metadata.clearedCorridors);
  const corridorsRaw =
    rawA.length > 0 ? rawA : rawB.length > 0 ? rawB : rawC;

  const corridors = corridorsRaw
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }
      const corridorObj = asObject(value);
      if (!corridorObj) {
        return "";
      }
      const country =
        asString(corridorObj.country) || asString(corridorObj.countryCode) || "";
      const currency =
        asString(corridorObj.currency) || asString(corridorObj.fiatCurrency) || "";
      return [country, currency].filter(Boolean).join("-");
    })
    .filter((value) => value.length > 0);

  return {
    status: normalizeStatus(statusRaw),
    tier,
    corridors,
    limits: {
      daily:
        asString(limitsObj.daily) ||
        asString(limitsObj.dailyLimit) ||
        asString(metadata.dailyLimit),
      monthly:
        asString(limitsObj.monthly) ||
        asString(limitsObj.monthlyLimit) ||
        asString(metadata.monthlyLimit),
    },
    raw: payload,
  };
}

export async function getPersonaVerificationSnapshot(
  input: PersonaCheckInput,
  credentials: PersonaCredentials
): Promise<PersonaVerificationSnapshot> {
  if (input.inquiryId) {
    const payload = await personaRequest(
      `/inquiries/${encodeURIComponent(input.inquiryId)}`,
      { method: "GET" },
      credentials
    );
    return extractVerificationSnapshot(payload);
  }

  const referenceId = pickReferenceId(input);
  if (!referenceId && !input.statusEndpoint) {
    return {
      status: "not_started",
      tier: "unknown",
      corridors: [],
      limits: {},
      raw: {},
    };
  }

  const payload = input.statusEndpoint
    ? await personaRequest(input.statusEndpoint, { method: "GET" }, credentials)
    : await personaRequest(
        `/inquiries?filter[reference-id]=${encodeURIComponent(referenceId || "")}&page[size]=1`,
        { method: "GET" },
        credentials
      );

  return extractVerificationSnapshot(payload);
}

export async function createPersonaInquiry(
  input: {
    walletAddress?: string;
    email?: string;
    referenceId?: string;
    inquiryTemplateId?: string;
    redirectUri?: string;
  },
  credentials: PersonaCredentials
): Promise<{
  inquiryId?: string;
  inquiryUrl?: string;
  referenceId: string;
  raw: unknown;
}> {
  const referenceId =
    input.referenceId ||
    input.walletAddress ||
    input.email ||
    `persona-${Date.now()}`;

  const attributes: Record<string, unknown> = {
    "reference-id": referenceId,
  };
  if (input.inquiryTemplateId) {
    attributes["inquiry-template-id"] = input.inquiryTemplateId;
  }
  if (input.redirectUri) {
    attributes["redirect-uri"] = input.redirectUri;
  }
  if (input.walletAddress || input.email) {
    attributes.metadata = {
      walletAddress: input.walletAddress,
      email: input.email,
    };
  }

  const payload = await personaRequest(
    "/inquiries",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "inquiry",
          attributes,
        },
      }),
    },
    credentials
  );

  const root = asObject(payload) || {};
  const data = asObject(root.data) || {};
  const attrs = asObject(data.attributes) || {};
  const meta = asObject(root.meta) || {};

  return {
    inquiryId: asString(data.id),
    inquiryUrl:
      asString(attrs["inquiry-url"]) ||
      asString(attrs.inquiryUrl) ||
      asString(meta["one-time-link"]) ||
      asString(meta.oneTimeLink) ||
      asString(meta["one-time-link-short"]) ||
      asString(meta.oneTimeLinkShort),
    referenceId,
    raw: payload,
  };
}
