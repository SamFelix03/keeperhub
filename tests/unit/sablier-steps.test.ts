import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/workflow/executor/step-handler", () => ({
  withStepLogging: (_input: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/metrics/instrumentation/plugin", () => ({
  withPluginMetrics: (_opts: unknown, fn: () => unknown) => fn(),
}));

const mockContract = {
  withdrawableAmountOf: vi.fn(),
  statusOf: vi.fn(),
  getDepositedAmount: vi.fn(),
  getWithdrawnAmount: vi.fn(),
  getRefundedAmount: vi.fn(),
  getSender: vi.fn(),
  getRecipient: vi.fn(),
  getStartTime: vi.fn(),
  getEndTime: vi.fn(),
};

vi.mock("@/plugins/sablier/steps/sablier-core", () => ({
  getSablierContract: vi.fn().mockReturnValue(mockContract),
  parseStreamId: vi.fn().mockReturnValue(BigInt(1)),
  safeRead: async <T>(fn: () => Promise<T>) => fn(),
  STREAM_STATUS_LABELS: {
    0: "PENDING",
    1: "STREAMING",
    2: "SETTLED",
    3: "CANCELED",
    4: "DEPLETED",
  },
}));

vi.mock("@/lib/rpc/network-utils", () => ({
  getChainIdFromNetwork: vi.fn().mockReturnValue(11155420),
}));

vi.mock("@/lib/rpc/rpc-config", () => ({
  getRpcUrlByChainId: vi.fn().mockReturnValue("https://rpc.example.com"),
}));

vi.mock("ethers", () => ({
  ethers: {
    JsonRpcProvider: vi.fn().mockImplementation(function MockProvider() {
      return {
        getBlockNumber: vi.fn().mockResolvedValue(123456),
      };
    }),
  },
}));

describe("sablier steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getUnlockableAmountStep returns withdrawable amount and status", async () => {
    mockContract.withdrawableAmountOf.mockResolvedValue(BigInt(250));
    mockContract.statusOf.mockResolvedValue(1);

    const { getUnlockableAmountStep } = await import(
      "@/plugins/sablier/steps/get-unlockable-amount"
    );

    const result = await getUnlockableAmountStep({
      network: "op-sepolia",
      lockupContractAddress: "0xlockup",
      streamId: "1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.withdrawableAmount).toBe("250");
      expect(result.status).toBe("STREAMING");
    }
  });

  it("getStreamStateStep computes remaining amount", async () => {
    mockContract.statusOf.mockResolvedValue(1);
    mockContract.withdrawableAmountOf.mockResolvedValue(BigInt(100));
    mockContract.getDepositedAmount.mockResolvedValue(BigInt(1000));
    mockContract.getWithdrawnAmount.mockResolvedValue(BigInt(300));
    mockContract.getRefundedAmount.mockResolvedValue(BigInt(100));
    mockContract.getSender.mockResolvedValue("0xsender");
    mockContract.getRecipient.mockResolvedValue("0xrecipient");
    mockContract.getStartTime.mockResolvedValue(BigInt(1000));
    mockContract.getEndTime.mockResolvedValue(BigInt(2000));

    const { getStreamStateStep } = await import(
      "@/plugins/sablier/steps/get-stream-state"
    );

    const result = await getStreamStateStep({
      network: "10",
      lockupContractAddress: "0xlockup",
      streamId: "1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.remainingAmount).toBe("600");
      expect(result.sender).toBe("0xsender");
    }
  });

  it("subscribeToStreamEventsStep returns subscription payload", async () => {
    const { subscribeToStreamEventsStep } = await import(
      "@/plugins/sablier/steps/subscribe-to-stream-events"
    );

    const result = await subscribeToStreamEventsStep({
      network: "op-sepolia",
      lockupContractAddress: "0xlockup",
      webhookUrl: "https://example.com/hook",
      walletAddress: "0xwallet",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subscription.fromBlock).toBe(123456);
      expect(result.subscription.eventTypes).toContain("create");
    }
  });
});
