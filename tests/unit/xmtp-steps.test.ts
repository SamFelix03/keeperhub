import { ethers } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/workflow/executor/step-handler", () => ({
  withStepLogging: (_input: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/metrics/instrumentation/plugin", () => ({
  withPluginMetrics: (_opts: unknown, fn: () => unknown) => fn(),
}));

const mockSendXmtpTextMessage = vi.fn();
const mockCreateXmtpClientForOrganization = vi.fn();
const mockResolveXmtpEnv = vi.fn().mockImplementation((env?: string) => env || "testnet");

vi.mock("@/plugins/xmtp/steps/xmtp-core", () => ({
  sendXmtpTextMessage: (...args: unknown[]) => mockSendXmtpTextMessage(...args),
  createXmtpClientForOrganization: (...args: unknown[]) =>
    mockCreateXmtpClientForOrganization(...args),
  resolveXmtpEnv: (...args: unknown[]) => mockResolveXmtpEnv(...args),
}));

describe("xmtp steps", () => {
  const stepContext = {
    nodeId: "node_1",
    nodeName: "XMTP Node",
    nodeType: "action" as const,
    organizationId: "org_1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMessageStep sends a direct message", async () => {
    mockSendXmtpTextMessage.mockResolvedValue({
      senderAddress: "0x1111111111111111111111111111111111111111",
      recipientAddress: "0x2222222222222222222222222222222222222222",
      conversationId: "conv_1",
      messageId: "msg_1",
    });

    const { sendMessageStep } = await import("@/plugins/xmtp/steps/send-message");
    const result = await sendMessageStep({
      recipientAddress: "0x2222222222222222222222222222222222222222",
      message: "hello",
      xmtpEnv: "testnet",
      _context: stepContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.conversationId).toBe("conv_1");
      expect(result.messageId).toBe("msg_1");
    }
  });

  it("subscribeToInboxStep prepares subscription metadata", async () => {
    mockCreateXmtpClientForOrganization.mockResolvedValue({
      senderAddress: "0x1111111111111111111111111111111111111111",
      client: {},
    });

    const { subscribeToInboxStep } = await import(
      "@/plugins/xmtp/steps/subscribe-to-inbox"
    );
    const result = await subscribeToInboxStep({
      webhookUrl: "https://example.com/xmtp",
      whitelistSenders:
        "0xAa00000000000000000000000000000000000001, 0xBb00000000000000000000000000000000000002",
      pollIntervalSeconds: "45",
      _context: stepContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subscription.pollIntervalSeconds).toBe(45);
      expect(result.subscription.whitelistSenders).toHaveLength(2);
      expect(result.subscription.senderAddress).toBe(
        "0x1111111111111111111111111111111111111111"
      );
    }
  });

  it("parsePaymentIntentStep verifies signature and parses payload", async () => {
    const wallet = ethers.Wallet.createRandom();
    const payload = JSON.stringify({
      type: "payment",
      amount: 500,
      token: "USDC",
      chain: "base",
      recipient: "0x3333333333333333333333333333333333333333",
    });
    const signature = await wallet.signMessage(payload);

    const { parsePaymentIntentStep } = await import(
      "@/plugins/xmtp/steps/parse-payment-intent"
    );
    const result = await parsePaymentIntentStep({
      messageBody: payload,
      senderAddress: wallet.address,
      messageSignature: signature,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.intent.amount).toBe(500);
      expect(result.senderAddress).toBe(wallet.address);
    }
  });

  it("parsePaymentIntentStep rejects invalid payloads", async () => {
    const { parsePaymentIntentStep } = await import(
      "@/plugins/xmtp/steps/parse-payment-intent"
    );
    const result = await parsePaymentIntentStep({
      messageBody: JSON.stringify({
        type: "payment",
        token: "USDC",
      }),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Failed to parse payment intent");
    }
  });

  it("sendTransactionReceiptStep sends a receipt payload", async () => {
    mockSendXmtpTextMessage.mockResolvedValue({
      senderAddress: "0x1111111111111111111111111111111111111111",
      recipientAddress: "0x2222222222222222222222222222222222222222",
      conversationId: "conv_receipt",
      messageId: "msg_receipt",
    });

    const { sendTransactionReceiptStep } = await import(
      "@/plugins/xmtp/steps/send-transaction-receipt"
    );
    const result = await sendTransactionReceiptStep({
      recipientAddress: "0x2222222222222222222222222222222222222222",
      transactionHash: "0xabc123",
      network: "op-sepolia",
      amount: "250",
      token: "USDC",
      paymentIntentId: "intent_1",
      _context: stepContext,
    });

    expect(result.success).toBe(true);
    expect(mockSendXmtpTextMessage).toHaveBeenCalledTimes(1);
    const callArg = mockSendXmtpTextMessage.mock.calls[0]?.[0] as {
      message: string;
    };
    expect(callArg.message).toContain("\"transactionHash\":\"0xabc123\"");
    expect(callArg.message).toContain("\"paymentIntentId\":\"intent_1\"");
  });
});
