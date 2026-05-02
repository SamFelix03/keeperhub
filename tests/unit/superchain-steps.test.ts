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

const mockAcrossGet = vi.fn();
vi.mock("@/plugins/superchain/steps/superchain-core", () => ({
  acrossGet: (...args: unknown[]) => mockAcrossGet(...args),
}));

describe("superchain steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSupportedRoutesStep handles array response", async () => {
    mockAcrossGet.mockResolvedValue([{ originChainId: 8453, destinationChainId: 10 }]);

    const { getSupportedRoutesStep } = await import(
      "@/plugins/superchain/steps/get-supported-routes"
    );

    const result = await getSupportedRoutesStep({
      networkMode: "testnet",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(1);
    }
  });

  it("getRouteQuoteStep returns approval transaction count", async () => {
    mockAcrossGet.mockResolvedValue({
      approvalTxns: [{ to: "0x1" }, { to: "0x2" }],
      expectedFillTime: 3,
      quoteExpiryTimestamp: 123,
    });

    const { getRouteQuoteStep } = await import(
      "@/plugins/superchain/steps/get-route-quote"
    );

    const result = await getRouteQuoteStep({
      networkMode: "testnet",
      originChainId: "84532",
      destinationChainId: "11155420",
      inputToken: "0xinput",
      outputToken: "0xoutput",
      amount: "1000000",
      depositor: "0xdepositor",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.approvalTxCount).toBe(2);
      expect(result.expectedFillTime).toBe(3);
    }
  });

  it("initiateTransferStep fails when swapTx is missing", async () => {
    mockAcrossGet.mockResolvedValue({
      approvalTxns: [],
    });

    const { initiateTransferStep } = await import(
      "@/plugins/superchain/steps/initiate-transfer"
    );

    const result = await initiateTransferStep({
      networkMode: "testnet",
      originChainId: "84532",
      destinationChainId: "11155420",
      inputToken: "0xinput",
      outputToken: "0xoutput",
      amount: "1000000",
      depositor: "0xdepositor",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("swap transaction payload");
    }
  });

  it("pollTransferStatusStep validates required identifiers", async () => {
    const { pollTransferStatusStep } = await import(
      "@/plugins/superchain/steps/poll-transfer-status"
    );

    const result = await pollTransferStatusStep({
      networkMode: "testnet",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Provide either depositTxnRef");
    }
  });

  it("pollTransferStatusStep returns status payload", async () => {
    mockAcrossGet.mockResolvedValue({
      status: "filled",
      fillTxnRef: "0xfill",
      destinationChainId: 10,
      originChainId: 8453,
      depositId: 1001,
    });

    const { pollTransferStatusStep } = await import(
      "@/plugins/superchain/steps/poll-transfer-status"
    );

    const result = await pollTransferStatusStep({
      networkMode: "mainnet",
      depositTxnRef: "0xdeposit",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("filled");
      expect(result.fillTxnRef).toBe("0xfill");
    }
  });
});
