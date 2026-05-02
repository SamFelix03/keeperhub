import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/workflow/executor/step-handler", () => ({
  withStepLogging: (_input: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/metrics/instrumentation/plugin", () => ({
  withPluginMetrics: (_opts: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/credential-fetcher", () => ({
  fetchCredentials: vi.fn().mockResolvedValue({}),
}));

const mockGetOnramperQuote = vi.fn();
const mockGetTransakQuote = vi.fn();
const mockResolveEnvironmentMode = vi.fn().mockReturnValue("testnet");
const mockGetOnramperSupported = vi.fn();
const mockGetTransakFiatCurrencies = vi.fn();
const mockFetchJson = vi.fn();

vi.mock("@/plugins/offramp/steps/offramp-core", () => ({
  getOnramperQuote: (...args: unknown[]) => mockGetOnramperQuote(...args),
  getTransakQuote: (...args: unknown[]) => mockGetTransakQuote(...args),
  resolveEnvironmentMode: (...args: unknown[]) => mockResolveEnvironmentMode(...args),
  getOnramperSupported: (...args: unknown[]) => mockGetOnramperSupported(...args),
  getTransakFiatCurrencies: (...args: unknown[]) =>
    mockGetTransakFiatCurrencies(...args),
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

describe("offramp steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getBestQuoteStep ranks provider quotes", async () => {
    mockGetOnramperQuote.mockResolvedValue([{ fiatAmount: 98 }]);
    mockGetTransakQuote.mockResolvedValue({ data: { fiatAmount: 100 } });

    const { getBestQuoteStep } = await import(
      "@/plugins/offramp/steps/get-best-quote"
    );

    const result = await getBestQuoteStep({
      fiatCurrency: "PHP",
      cryptoCurrency: "USDC",
      amount: "100",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.bestQuote.provider).toBe("transak");
      expect(result.count).toBe(2);
    }
  });

  it("getRateHistoryStep returns mapped points", async () => {
    mockFetchJson.mockResolvedValue({
      prices: [
        [1710000000000, 1],
        [1710003600000, 1.01],
      ],
    });

    const { getRateHistoryStep } = await import(
      "@/plugins/offramp/steps/get-rate-history"
    );

    const result = await getRateHistoryStep({
      cryptoCurrency: "USDC",
      fiatCurrency: "NGN",
      days: "7",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(2);
      expect(result.source).toBe("coingecko");
    }
  });

  it("triggerConversionStep returns redirect for onramper", async () => {
    const { triggerConversionStep } = await import(
      "@/plugins/offramp/steps/trigger-conversion"
    );

    const result = await triggerConversionStep({
      provider: "onramper",
      fiatCurrency: "PHP",
      cryptoCurrency: "USDC",
      amount: "100",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.provider).toBe("onramper");
      expect(result.redirectUrl).toContain("buy.onramper.com");
    }
  });

  it("getSupportedCorridorsStep returns merged providers", async () => {
    mockGetOnramperSupported.mockResolvedValue({ countries: ["ph"] });
    mockGetTransakFiatCurrencies.mockResolvedValue({ response: ["PHP"] });

    const { getSupportedCorridorsStep } = await import(
      "@/plugins/offramp/steps/get-supported-corridors"
    );

    const result = await getSupportedCorridorsStep({
      providerMode: "auto",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(2);
    }
  });

  it("getConversionStatusStep supports external endpoint polling", async () => {
    mockFetchJson.mockResolvedValue({ status: "processing" });

    const { getConversionStatusStep } = await import(
      "@/plugins/offramp/steps/get-conversion-status"
    );

    const result = await getConversionStatusStep({
      provider: "onramper",
      statusEndpoint: "https://example.com/status",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("external");
    }
  });
});
