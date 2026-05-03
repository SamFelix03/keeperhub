import type { IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { XmtpIcon } from "./icon";

const xmtpPlugin: IntegrationPlugin = {
  type: "xmtp",
  label: "XMTP",
  description:
    "Send encrypted wallet-to-wallet messages and process structured payment intents",
  icon: XmtpIcon,
  formFields: [
    {
      id: "env",
      label: "XMTP Environment (Optional)",
      type: "text",
      configKey: "XMTP_ENV",
      envVar: "XMTP_ENV",
      defaultValue: "testnet",
      helpText:
        "Use testnet/dev for demos and production/mainnet for live messaging.",
    },
    {
      id: "dbPath",
      label: "XMTP DB Path (Optional)",
      type: "text",
      placeholder: "/tmp/keeperhub-xmtp",
      configKey: "XMTP_DB_PATH",
      envVar: "XMTP_DB_PATH",
      helpText:
        "Optional persistent storage path for XMTP client state when running long-lived listeners.",
    },
  ],
  testConfig: {
    getTestFunction: async () => {
      const { testXmtp } = await import("./test");
      return testXmtp;
    },
  },
  actions: [
    {
      slug: "send-message",
      label: "Send Message",
      description:
        "Sign and send an encrypted XMTP message from the org wallet to a recipient wallet",
      category: "XMTP",
      stepFunction: "sendMessageStep",
      stepImportPath: "send-message",
      configFields: [
        {
          key: "recipientAddress",
          label: "Recipient Wallet Address",
          type: "template-input",
          placeholder: "0x...",
          required: true,
          isAddressField: true,
        },
        {
          key: "message",
          label: "Message",
          type: "template-textarea",
          placeholder: "Payment received...",
          rows: 4,
          required: true,
        },
        {
          key: "xmtpEnv",
          label: "XMTP Environment (Optional)",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet" },
            { value: "dev", label: "Dev" },
            { value: "production", label: "Production" },
            { value: "mainnet", label: "Mainnet" },
          ],
          defaultValue: "testnet",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether send succeeded" },
        { field: "senderAddress", description: "Sender org wallet address" },
        { field: "recipientAddress", description: "Recipient wallet address" },
        { field: "conversationId", description: "Conversation identifier" },
        { field: "messageId", description: "Message identifier if available" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "subscribe-to-inbox",
      label: "Subscribe To Inbox",
      description:
        "Prepare and validate an XMTP inbox subscription config for webhook-triggered processing",
      category: "XMTP",
      stepFunction: "subscribeToInboxStep",
      stepImportPath: "subscribe-to-inbox",
      configFields: [
        {
          key: "webhookUrl",
          label: "Webhook URL",
          type: "template-input",
          placeholder: "https://example.com/webhooks/xmtp",
          required: true,
        },
        {
          key: "whitelistSenders",
          label: "Whitelisted Senders (Optional)",
          type: "template-input",
          placeholder: "0xabc...,0xdef...",
          required: false,
        },
        {
          key: "pollIntervalSeconds",
          label: "Poll Interval Seconds (Optional)",
          type: "number",
          min: 10,
          defaultValue: "30",
          required: false,
        },
        {
          key: "xmtpEnv",
          label: "XMTP Environment (Optional)",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet" },
            { value: "dev", label: "Dev" },
            { value: "production", label: "Production" },
            { value: "mainnet", label: "Mainnet" },
          ],
          defaultValue: "testnet",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether setup succeeded" },
        { field: "subscription", description: "Prepared subscription metadata" },
        { field: "notes", description: "Operational notes for listener wiring" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "parse-payment-intent",
      label: "Parse Payment Intent",
      description:
        "Validate a structured XMTP payload and extract amount/token/chain/recipient intent fields",
      category: "XMTP",
      stepFunction: "parsePaymentIntentStep",
      stepImportPath: "parse-payment-intent",
      configFields: [
        {
          key: "messageBody",
          label: "Message Body",
          type: "template-textarea",
          placeholder:
            "{\"type\":\"payment\",\"amount\":500,\"token\":\"USDC\",\"chain\":\"base\",\"recipient\":\"0x...\"}",
          rows: 6,
          required: true,
        },
        {
          key: "senderAddress",
          label: "Expected Sender Address (Optional)",
          type: "template-input",
          placeholder: "0x...",
          required: false,
          isAddressField: true,
        },
        {
          key: "messageSignature",
          label: "Sender Signature (Optional)",
          type: "template-input",
          placeholder: "0x...",
          required: false,
        },
        {
          key: "signaturePayload",
          label: "Signature Payload (Optional)",
          type: "template-textarea",
          placeholder: "Defaults to messageBody when omitted",
          rows: 4,
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether parse/validation succeeded" },
        { field: "isValid", description: "Whether the intent is valid" },
        { field: "intent", description: "Parsed payment intent payload" },
        { field: "senderAddress", description: "Verified sender address" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "send-transaction-receipt",
      label: "Send Transaction Receipt",
      description:
        "Send an XMTP receipt message linking a tx hash to an original payment intent",
      category: "XMTP",
      stepFunction: "sendTransactionReceiptStep",
      stepImportPath: "send-transaction-receipt",
      configFields: [
        {
          key: "recipientAddress",
          label: "Recipient Wallet Address",
          type: "template-input",
          placeholder: "0x...",
          required: true,
          isAddressField: true,
        },
        {
          key: "transactionHash",
          label: "Transaction Hash",
          type: "template-input",
          placeholder: "0x...",
          required: true,
        },
        {
          key: "network",
          label: "Network",
          type: "template-input",
          placeholder: "op-sepolia",
          required: true,
        },
        {
          key: "amount",
          label: "Amount",
          type: "template-input",
          placeholder: "500",
          required: true,
        },
        {
          key: "token",
          label: "Token",
          type: "template-input",
          placeholder: "USDC",
          required: true,
        },
        {
          key: "paymentIntentId",
          label: "Payment Intent ID (Optional)",
          type: "template-input",
          placeholder: "intent-123",
          required: false,
        },
        {
          key: "xmtpEnv",
          label: "XMTP Environment (Optional)",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet" },
            { value: "dev", label: "Dev" },
            { value: "production", label: "Production" },
            { value: "mainnet", label: "Mainnet" },
          ],
          defaultValue: "testnet",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether receipt delivery succeeded" },
        { field: "senderAddress", description: "Sender org wallet address" },
        { field: "recipientAddress", description: "Recipient wallet address" },
        { field: "transactionHash", description: "Transaction hash included" },
        { field: "conversationId", description: "Conversation identifier" },
        { field: "messageId", description: "Message identifier if available" },
        { field: "error", description: "Error message if failed" },
      ],
    },
  ],
};

registerIntegration(xmtpPlugin);

export default xmtpPlugin;
