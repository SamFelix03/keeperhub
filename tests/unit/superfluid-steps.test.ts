import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/workflow/executor/step-handler", () => ({
  withStepLogging: (_input: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/metrics/instrumentation/plugin", () => ({
  withPluginMetrics: (_opts: unknown, fn: () => unknown) => fn(),
}));

const mockQuerySuperfluidSubgraph = vi.fn();
const mockSetFlowRateCore = vi.fn();
vi.mock("@/plugins/superfluid/steps/superfluid-core", () => ({
  querySuperfluidSubgraph: (...args: unknown[]) =>
    mockQuerySuperfluidSubgraph(...args),
  setFlowRateCore: (...args: unknown[]) => mockSetFlowRateCore(...args),
}));

const mockRealtimeBalanceOfNow = vi.fn();
vi.mock("ethers", () => ({
  ethers: {
    JsonRpcProvider: vi.fn().mockImplementation(function MockProvider() {
      return {};
    }),
    Contract: vi.fn().mockImplementation(function MockContract() {
      return {
        realtimeBalanceOfNow: mockRealtimeBalanceOfNow,
      };
    }),
  },
}));

vi.mock("@/lib/rpc/network-utils", () => ({
  getChainIdFromNetwork: vi.fn().mockReturnValue(10),
}));

vi.mock("@/lib/rpc/rpc-config", () => ({
  getRpcUrlByChainId: vi.fn().mockReturnValue("https://rpc.example.com"),
}));

describe("superfluid steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getIncomingStreamsStep returns filtered streams with aggregate flow", async () => {
    mockQuerySuperfluidSubgraph.mockResolvedValue({
      streams: [
        {
          id: "s1",
          sender: { id: "0xsender1" },
          receiver: { id: "0xreceiver" },
          token: { id: "0xtokena", symbol: "USDCx", name: "USD Coin Super" },
          currentFlowRate: "20",
          streamedUntilUpdatedAt: "100",
          updatedAtTimestamp: "200",
        },
        {
          id: "s2",
          sender: { id: "0xsender2" },
          receiver: { id: "0xreceiver" },
          token: { id: "0xtokenb", symbol: "DAIx", name: "DAI Super" },
          currentFlowRate: "30",
          streamedUntilUpdatedAt: "110",
          updatedAtTimestamp: "210",
        },
      ],
    });

    const { getIncomingStreamsStep } = await import(
      "@/plugins/superfluid/steps/get-incoming-streams"
    );

    const result = await getIncomingStreamsStep({
      network: "10",
      walletAddress: "0xreceiver",
      tokenAddress: "0xtokena",
    });

    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(1);
      expect(result.totalFlowRate).toBe("20");
      expect(result.streams[0]?.tokenAddress).toBe("0xtokena");
    }
  });

  it("getRealTimeBalanceStep returns on-chain realtime balance", async () => {
    mockRealtimeBalanceOfNow.mockResolvedValue([
      BigInt(1000),
      BigInt(200),
      BigInt(10),
      BigInt(123456),
    ]);
    mockQuerySuperfluidSubgraph.mockResolvedValue({
      accountTokenSnapshots: [
        {
          totalInflowRate: "30",
          totalOutflowRate: "10",
          totalNetFlowRate: "20",
        },
      ],
    });

    const { getRealTimeBalanceStep } = await import(
      "@/plugins/superfluid/steps/get-real-time-balance"
    );

    const result = await getRealTimeBalanceStep({
      network: "10",
      walletAddress: "0xwallet",
      tokenAddress: "0xtoken",
    });

    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.availableBalance).toBe("1000");
    expect(result.totalNetFlowRate).toBe("20");
  });

  it("createOutgoingStreamStep delegates to setFlowRateCore", async () => {
    mockSetFlowRateCore.mockResolvedValue({
      success: true,
      transactionHash: "0xhash",
      transactionLink: "https://scan/tx/0xhash",
      gasUsed: "21000",
      gasUsedUnits: "21000",
      effectiveGasPrice: "1000000000",
    });

    const { createOutgoingStreamStep } = await import(
      "@/plugins/superfluid/steps/create-outgoing-stream"
    );

    const result = await createOutgoingStreamStep({
      network: "10",
      tokenAddress: "0xtoken",
      recipientAddress: "0xreceiver",
      flowRate: "123",
    });

    expect(result.success).toBe(true);
    expect(mockSetFlowRateCore).toHaveBeenCalledTimes(1);
    expect(mockSetFlowRateCore.mock.calls[0]?.[0]).toMatchObject({
      flowRate: "123",
      recipientAddress: "0xreceiver",
    });
  });

  it("modifyStreamDestinationStep returns partial failure details", async () => {
    mockSetFlowRateCore
      .mockResolvedValueOnce({
        success: true,
        transactionHash: "0xclose",
        transactionLink: "https://scan/tx/0xclose",
        gasUsed: "21000",
        gasUsedUnits: "21000",
        effectiveGasPrice: "1",
      })
      .mockResolvedValueOnce({
        success: false,
        error: "insufficient balance",
      });

    const { modifyStreamDestinationStep } = await import(
      "@/plugins/superfluid/steps/modify-stream-destination"
    );

    const result = await modifyStreamDestinationStep({
      network: "10",
      tokenAddress: "0xtoken",
      currentRecipientAddress: "0xold",
      newRecipientAddress: "0xnew",
      newFlowRate: "500",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.closedTransactionHash).toBe("0xclose");
      expect(result.error).toContain("failed to create new stream");
    }
  });

  it("closeStreamStep calls setFlowRateCore with zero flow", async () => {
    mockSetFlowRateCore.mockResolvedValue({
      success: true,
      transactionHash: "0xhash",
      transactionLink: "https://scan/tx/0xhash",
      gasUsed: "21000",
      gasUsedUnits: "21000",
      effectiveGasPrice: "1000000000",
    });

    const { closeStreamStep } = await import(
      "@/plugins/superfluid/steps/close-stream"
    );

    const result = await closeStreamStep({
      network: "10",
      tokenAddress: "0xtoken",
      recipientAddress: "0xreceiver",
    });

    expect(result.success).toBe(true);
    expect(mockSetFlowRateCore.mock.calls[0]?.[0]).toMatchObject({
      flowRate: "0",
    });
  });

  it("getStreamEventsStep filters by wallet address", async () => {
    mockQuerySuperfluidSubgraph.mockResolvedValue({
      flowUpdatedEvents: [
        {
          id: "e1",
          transactionHash: "0x1",
          blockNumber: "1",
          timestamp: "100",
          token: "0xtoken",
          sender: "0xwallet",
          receiver: "0xother",
          flowRate: "10",
        },
        {
          id: "e2",
          transactionHash: "0x2",
          blockNumber: "2",
          timestamp: "101",
          token: "0xtoken",
          sender: "0xother",
          receiver: "0xanother",
          flowRate: "20",
        },
      ],
    });

    const { getStreamEventsStep } = await import(
      "@/plugins/superfluid/steps/get-stream-events"
    );

    const result = await getStreamEventsStep({
      network: "10",
      walletAddress: "0xwallet",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.count).toBe(1);
      expect(result.events[0]?.id).toBe("e1");
    }
  });
});
