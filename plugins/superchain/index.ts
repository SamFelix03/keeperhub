import type { IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { SuperchainIcon } from "./icon";

const superchainPlugin: IntegrationPlugin = {
  type: "superchain",
  label: "Superchain",
  description:
    "Across-powered cross-chain route discovery, quote preparation, and transfer tracking",
  icon: SuperchainIcon,
  formFields: [
    {
      id: "apiKey",
      label: "Across API Key",
      type: "password",
      placeholder: "Across API key",
      configKey: "ACROSS_API_KEY",
      envVar: "ACROSS_API_KEY",
      helpText: "Used for production Across Swap API access.",
      helpLink: {
        text: "Across API docs",
        url: "https://docs.across.to/reference/api-reference",
      },
    },
    {
      id: "integratorId",
      label: "Integrator ID",
      type: "text",
      placeholder: "0xdead",
      configKey: "ACROSS_INTEGRATOR_ID",
      envVar: "ACROSS_INTEGRATOR_ID",
      helpText: "Integrator ID for production tracking and routing.",
    },
    {
      id: "baseUrl",
      label: "Base URL Override (Optional)",
      type: "url",
      placeholder: "https://app.across.to/api",
      configKey: "ACROSS_API_BASE_URL",
      envVar: "ACROSS_API_BASE_URL",
      helpText: "Leave empty to auto-select mainnet/testnet API endpoint.",
    },
  ],
  testConfig: {
    getTestFunction: async () => {
      const { testSuperchain } = await import("./test");
      return testSuperchain;
    },
  },
  actions: [
    {
      slug: "get-supported-routes",
      label: "Get Supported Routes",
      description:
        "List currently available chain routes from Across for a source/destination pair",
      category: "Superchain",
      stepFunction: "getSupportedRoutesStep",
      stepImportPath: "get-supported-routes",
      configFields: [
        {
          key: "networkMode",
          label: "Across Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet" },
            { value: "mainnet", label: "Mainnet" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "originChainId",
          label: "Origin Chain ID (Optional)",
          type: "template-input",
          placeholder: "8453",
          required: false,
        },
        {
          key: "destinationChainId",
          label: "Destination Chain ID (Optional)",
          type: "template-input",
          placeholder: "10",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether the request succeeded" },
        { field: "routes", description: "Across routes payload" },
        { field: "count", description: "Count when routes array is present" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-route-quote",
      label: "Get Route Quote",
      description:
        "Get an executable Across quote payload for a cross-chain transfer route",
      category: "Superchain",
      stepFunction: "getRouteQuoteStep",
      stepImportPath: "get-route-quote",
      configFields: [
        {
          key: "networkMode",
          label: "Across Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet" },
            { value: "mainnet", label: "Mainnet" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "tradeType",
          label: "Trade Type",
          type: "select",
          options: [
            { value: "exactInput", label: "Exact Input" },
            { value: "minOutput", label: "Min Output" },
          ],
          defaultValue: "exactInput",
          required: true,
        },
        {
          key: "originChainId",
          label: "Origin Chain ID",
          type: "template-input",
          placeholder: "8453",
          required: true,
        },
        {
          key: "destinationChainId",
          label: "Destination Chain ID",
          type: "template-input",
          placeholder: "10",
          required: true,
        },
        {
          key: "inputToken",
          label: "Input Token Address",
          type: "template-input",
          placeholder: "0x... token on origin chain",
          required: true,
          isAddressField: true,
        },
        {
          key: "outputToken",
          label: "Output Token Address",
          type: "template-input",
          placeholder: "0x... token on destination chain",
          required: true,
          isAddressField: true,
        },
        {
          key: "amount",
          label: "Amount (smallest unit)",
          type: "template-input",
          placeholder: "1000000",
          required: true,
        },
        {
          key: "depositor",
          label: "Depositor Address",
          type: "template-input",
          placeholder: "0x... origin-chain wallet",
          required: true,
          isAddressField: true,
        },
        {
          key: "recipient",
          label: "Recipient Address (Optional)",
          type: "template-input",
          placeholder: "0x... destination-chain wallet",
          required: false,
          isAddressField: true,
        },
        {
          key: "slippage",
          label: "Slippage (Optional)",
          type: "template-input",
          placeholder: "auto or 0.01",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether quote retrieval succeeded" },
        { field: "quote", description: "Full Across swap approval response" },
        { field: "expectedFillTime", description: "Estimated fill time (seconds)" },
        { field: "quoteExpiryTimestamp", description: "Quote expiry unix timestamp" },
        {
          field: "approvalTxCount",
          description: "Number of required approval transactions",
        },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "initiate-transfer",
      label: "Initiate Transfer",
      description:
        "Prepare approval and swap transactions for execution over Across",
      category: "Superchain",
      stepFunction: "initiateTransferStep",
      stepImportPath: "initiate-transfer",
      configFields: [
        {
          key: "networkMode",
          label: "Across Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet" },
            { value: "mainnet", label: "Mainnet" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "tradeType",
          label: "Trade Type",
          type: "select",
          options: [
            { value: "exactInput", label: "Exact Input" },
            { value: "minOutput", label: "Min Output" },
          ],
          defaultValue: "exactInput",
          required: true,
        },
        {
          key: "originChainId",
          label: "Origin Chain ID",
          type: "template-input",
          placeholder: "8453",
          required: true,
        },
        {
          key: "destinationChainId",
          label: "Destination Chain ID",
          type: "template-input",
          placeholder: "10",
          required: true,
        },
        {
          key: "inputToken",
          label: "Input Token Address",
          type: "template-input",
          placeholder: "0x... token on origin chain",
          required: true,
          isAddressField: true,
        },
        {
          key: "outputToken",
          label: "Output Token Address",
          type: "template-input",
          placeholder: "0x... token on destination chain",
          required: true,
          isAddressField: true,
        },
        {
          key: "amount",
          label: "Amount (smallest unit)",
          type: "template-input",
          placeholder: "1000000",
          required: true,
        },
        {
          key: "depositor",
          label: "Depositor Address",
          type: "template-input",
          placeholder: "0x... origin-chain wallet",
          required: true,
          isAddressField: true,
        },
        {
          key: "recipient",
          label: "Recipient Address (Optional)",
          type: "template-input",
          placeholder: "0x... destination-chain wallet",
          required: false,
          isAddressField: true,
        },
        {
          key: "slippage",
          label: "Slippage (Optional)",
          type: "template-input",
          placeholder: "auto or 0.01",
          required: false,
        },
        {
          key: "executeOnchain",
          label: "Broadcast Swap Transaction",
          type: "select",
          options: [
            { value: "false", label: "Prepare Only" },
            { value: "true", label: "Prepare + Broadcast" },
          ],
          defaultValue: "false",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether preparation succeeded" },
        { field: "executed", description: "Whether swap transaction was broadcast" },
        { field: "approvalTxns", description: "Approval transactions to execute first" },
        { field: "swapTx", description: "Main swap transaction payload" },
        { field: "depositTxnRef", description: "Origin chain deposit transaction hash" },
        { field: "expectedFillTime", description: "Estimated fill time (seconds)" },
        { field: "quoteExpiryTimestamp", description: "Quote expiry unix timestamp" },
        { field: "quoteId", description: "Across quote identifier, if available" },
        { field: "notes", description: "Execution guidance for next workflow steps" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "poll-transfer-status",
      label: "Poll Transfer Status",
      description:
        "Track whether an Across transfer is pending, filled, expired, or refunded",
      category: "Superchain",
      stepFunction: "pollTransferStatusStep",
      stepImportPath: "poll-transfer-status",
      configFields: [
        {
          key: "networkMode",
          label: "Across Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet" },
            { value: "mainnet", label: "Mainnet" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "depositTxnRef",
          label: "Deposit Transaction Hash (Optional)",
          type: "template-input",
          placeholder: "0x...",
          required: false,
        },
        {
          key: "originChainId",
          label: "Origin Chain ID (Optional)",
          type: "template-input",
          placeholder: "8453",
          required: false,
        },
        {
          key: "depositId",
          label: "Deposit ID (Optional)",
          type: "template-input",
          placeholder: "12345",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether status polling succeeded" },
        { field: "status", description: "Transfer status" },
        { field: "details", description: "Full Across status payload" },
        { field: "fillTxnRef", description: "Destination fill transaction hash" },
        { field: "error", description: "Error message if failed" },
      ],
    },
  ],
};

registerIntegration(superchainPlugin);

export default superchainPlugin;
