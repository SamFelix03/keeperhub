import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/workflow/executor/step-handler", () => ({
  withStepLogging: (_input: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/metrics/instrumentation/plugin", () => ({
  withPluginMetrics: (_opts: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/credential-fetcher", () => ({
  fetchCredentials: vi.fn().mockResolvedValue({
    PERSONA_API_KEY: "persona_test",
    PERSONA_WEBHOOK_SECRET: "whsec_test",
  }),
}));

const mockGetPersonaVerificationSnapshot = vi.fn();
const mockCreatePersonaInquiry = vi.fn();

vi.mock("@/plugins/persona/steps/persona-core", () => ({
  getPersonaVerificationSnapshot: (...args: unknown[]) =>
    mockGetPersonaVerificationSnapshot(...args),
  createPersonaInquiry: (...args: unknown[]) => mockCreatePersonaInquiry(...args),
}));

describe("persona steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checkVerificationStatusStep returns status summary", async () => {
    mockGetPersonaVerificationSnapshot.mockResolvedValue({
      status: "approved",
      tier: "enhanced",
      corridors: ["NG-NGN", "PH-PHP"],
      limits: { daily: "1000", monthly: "10000" },
      raw: { data: [] },
    });

    const { checkVerificationStatusStep } = await import(
      "@/plugins/persona/steps/check-verification-status"
    );
    const result = await checkVerificationStatusStep({
      walletAddress: "0x1111111111111111111111111111111111111111",
      integrationId: "persona_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("approved");
      expect(result.tier).toBe("enhanced");
      expect(result.corridors).toContain("NG-NGN");
    }
  });

  it("createInquiryStep returns inquiry URL", async () => {
    mockCreatePersonaInquiry.mockResolvedValue({
      inquiryId: "inq_1",
      inquiryUrl: "https://withpersona.com/verify?inquiry-id=inq_1",
      referenceId: "user_1",
      raw: { data: {} },
    });

    const { createInquiryStep } = await import(
      "@/plugins/persona/steps/create-inquiry"
    );
    const result = await createInquiryStep({
      referenceId: "user_1",
      integrationId: "persona_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.inquiryId).toBe("inq_1");
      expect(result.inquiryUrl).toContain("withpersona.com");
    }
  });

  it("getClearedCorridorsStep returns corridor list", async () => {
    mockGetPersonaVerificationSnapshot.mockResolvedValue({
      status: "approved",
      tier: "basic",
      corridors: ["NG-NGN"],
      limits: {},
      raw: { data: [] },
    });

    const { getClearedCorridorsStep } = await import(
      "@/plugins/persona/steps/get-cleared-corridors"
    );
    const result = await getClearedCorridorsStep({
      email: "user@example.com",
      integrationId: "persona_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(1);
      expect(result.corridors[0]).toBe("NG-NGN");
    }
  });

  it("subscribeVerificationWebhookStep includes signature notes", async () => {
    const { subscribeVerificationWebhookStep } = await import(
      "@/plugins/persona/steps/subscribe-verification-webhook"
    );
    const result = await subscribeVerificationWebhookStep({
      webhookUrl: "https://example.com/persona",
      integrationId: "persona_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subscription.provider).toBe("persona");
      expect(result.notes).toContain("PERSONA_WEBHOOK_SECRET");
    }
  });

  it("getTransactionLimitsStep returns limit payload", async () => {
    mockGetPersonaVerificationSnapshot.mockResolvedValue({
      status: "approved",
      tier: "institutional",
      corridors: [],
      limits: { daily: "5000", monthly: "100000" },
      raw: { data: [] },
    });

    const { getTransactionLimitsStep } = await import(
      "@/plugins/persona/steps/get-transaction-limits"
    );
    const result = await getTransactionLimitsStep({
      referenceId: "org_42",
      integrationId: "persona_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tier).toBe("institutional");
      expect(result.limits.daily).toBe("5000");
      expect(result.limits.monthly).toBe("100000");
    }
  });
});
