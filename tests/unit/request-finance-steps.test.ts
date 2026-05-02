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
    REQUEST_FINANCE_API_KEY: "rk_test",
    REQUEST_FINANCE_WEBHOOK_SECRET: "whsec_test",
  }),
}));

const mockRequestFinanceGet = vi.fn();
vi.mock("@/plugins/request-finance/steps/request-finance-core", () => ({
  requestFinanceGet: (...args: unknown[]) => mockRequestFinanceGet(...args),
}));

describe("request finance steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribeInvoiceEventsStep includes webhook notes", async () => {
    const { subscribeInvoiceEventsStep } = await import(
      "@/plugins/request-finance/steps/subscribe-invoice-events"
    );

    const result = await subscribeInvoiceEventsStep({
      webhookUrl: "https://example.com/webhook",
      integrationId: "rf_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subscription.provider).toBe("request-finance");
      expect(result.notes).toContain("X-Webhook-Signature");
    }
  });

  it("getPaymentHistoryStep returns status summary", async () => {
    mockRequestFinanceGet.mockResolvedValue({
      data: [
        { id: "i1", status: "paid" },
        { id: "i2", status: "open" },
        { id: "i3", status: "paid" },
      ],
    });

    const { getPaymentHistoryStep } = await import(
      "@/plugins/request-finance/steps/get-payment-history"
    );

    const result = await getPaymentHistoryStep({
      take: "25",
      integrationId: "rf_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(3);
      expect(result.statuses.paid).toBe(2);
      expect(result.statuses.open).toBe(1);
    }
  });

  it("getPaymentHistoryStep filters by status", async () => {
    mockRequestFinanceGet.mockResolvedValue([
      { id: "i1", status: "paid" },
      { id: "i2", status: "open" },
    ]);

    const { getPaymentHistoryStep } = await import(
      "@/plugins/request-finance/steps/get-payment-history"
    );

    const result = await getPaymentHistoryStep({
      status: "paid",
      integrationId: "rf_1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(1);
      expect(result.invoices[0]?.id).toBe("i1");
    }
  });
});
