import type { IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { OfframpIcon } from "./icon";

const offrampPlugin: IntegrationPlugin = {
  type: "offramp",
  label: "Offramp",
  description:
    "Compare off-ramp providers, prepare conversion intents, and track payout status",
  icon: OfframpIcon,
  formFields: [
    {
      id: "onramperApiKey",
      label: "Onramper API Key",
      type: "password",
      placeholder: "pk_...",
      configKey: "ONRAMPER_API_KEY",
      envVar: "ONRAMPER_API_KEY",
      helpText: "Used for Onramper quote and corridor endpoints.",
      helpLink: {
        text: "Onramper API",
        url: "https://docs.onramper.com/reference/quotes",
      },
    },
    {
      id: "transakApiKey",
      label: "Transak API Key",
      type: "password",
      placeholder: "apiKey",
      configKey: "TRANSAK_API_KEY",
      envVar: "TRANSAK_API_KEY",
      helpText: "Used for Transak lookup quote and currency endpoints.",
      helpLink: {
        text: "Transak Quote API",
        url: "https://docs.transak.com/api/whitelabel/lookup/get-quote",
      },
    },
    {
      id: "transakAuthToken",
      label: "Transak Auth Token (Optional)",
      type: "password",
      placeholder: "authorization token",
      configKey: "TRANSAK_AUTH_TOKEN",
      envVar: "TRANSAK_AUTH_TOKEN",
      helpText: "Optional token for Transak order status polling.",
    },
    {
      id: "transakPartnerAccessToken",
      label: "Transak Partner Access Token (Optional)",
      type: "password",
      placeholder: "x-access-token",
      configKey: "TRANSAK_PARTNER_ACCESS_TOKEN",
      envVar: "TRANSAK_PARTNER_ACCESS_TOKEN",
      helpText: "Optional partner token for Transak order status polling.",
    },
    {
      id: "transakReferrerDomain",
      label: "Transak Referrer Domain (Optional)",
      type: "text",
      placeholder: "app.example.com",
      configKey: "TRANSAK_REFERRER_DOMAIN",
      envVar: "TRANSAK_REFERRER_DOMAIN",
      helpText: "Used when preparing Transak conversion intent payloads.",
    },
  ],
  testConfig: {
    getTestFunction: async () => {
      const { testOfframp } = await import("./test");
      return testOfframp;
    },
  },
  actions: [
    {
      slug: "get-best-quote",
      label: "Get Best Quote",
      description:
        "Compare Onramper and Transak off-ramp quotes for a corridor and rank best result",
      category: "Offramp",
      stepFunction: "getBestQuoteStep",
      stepImportPath: "get-best-quote",
      configFields: [
        {
          key: "providerMode",
          label: "Provider Mode",
          type: "select",
          options: [
            { value: "auto", label: "Auto (All Providers)" },
            { value: "onramper", label: "Onramper" },
            { value: "transak", label: "Transak" },
          ],
          defaultValue: "auto",
          required: true,
        },
        {
          key: "networkMode",
          label: "Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet / Staging" },
            { value: "mainnet", label: "Mainnet / Production" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "fiatCurrency",
          label: "Fiat Currency",
          type: "template-input",
          placeholder: "PHP",
          required: true,
        },
        {
          key: "cryptoCurrency",
          label: "Crypto Currency",
          type: "template-input",
          placeholder: "USDC",
          required: true,
        },
        {
          key: "amount",
          label: "Amount",
          type: "template-input",
          placeholder: "100",
          required: true,
        },
        {
          key: "countryCode",
          label: "Country Code (Optional)",
          type: "template-input",
          placeholder: "PH",
          required: false,
        },
        {
          key: "paymentMethod",
          label: "Payment Method (Optional)",
          type: "template-input",
          placeholder: "sepa_bank_transfer",
          required: false,
        },
        {
          key: "network",
          label: "Crypto Network (Optional)",
          type: "template-input",
          placeholder: "optimism",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether quote fetch succeeded" },
        { field: "bestQuote", description: "Best ranked quote across providers" },
        { field: "quotes", description: "All provider quotes with ranking data" },
        { field: "count", description: "Number of quotes returned" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-rate-history",
      label: "Get Rate History",
      description:
        "Fetch historical crypto/fiat market rates for conversion timing decisions",
      category: "Offramp",
      stepFunction: "getRateHistoryStep",
      stepImportPath: "get-rate-history",
      configFields: [
        {
          key: "cryptoCurrency",
          label: "Crypto Currency",
          type: "template-input",
          placeholder: "USDC",
          required: true,
        },
        {
          key: "fiatCurrency",
          label: "Fiat Currency",
          type: "template-input",
          placeholder: "NGN",
          required: true,
        },
        {
          key: "days",
          label: "Days",
          type: "number",
          min: 1,
          max: 90,
          defaultValue: "7",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether history fetch succeeded" },
        { field: "source", description: "Rate history data source" },
        { field: "points", description: "Historical price points" },
        { field: "count", description: "Number of points returned" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "trigger-conversion",
      label: "Trigger Conversion",
      description:
        "Prepare and initiate an off-ramp conversion flow with provider-specific payloads",
      category: "Offramp",
      stepFunction: "triggerConversionStep",
      stepImportPath: "trigger-conversion",
      configFields: [
        {
          key: "provider",
          label: "Provider",
          type: "select",
          options: [
            { value: "onramper", label: "Onramper" },
            { value: "transak", label: "Transak" },
          ],
          defaultValue: "onramper",
          required: true,
        },
        {
          key: "networkMode",
          label: "Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet / Staging" },
            { value: "mainnet", label: "Mainnet / Production" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "fiatCurrency",
          label: "Fiat Currency",
          type: "template-input",
          placeholder: "PHP",
          required: true,
        },
        {
          key: "cryptoCurrency",
          label: "Crypto Currency",
          type: "template-input",
          placeholder: "USDC",
          required: true,
        },
        {
          key: "amount",
          label: "Amount",
          type: "template-input",
          placeholder: "100",
          required: true,
        },
        {
          key: "network",
          label: "Crypto Network (Optional)",
          type: "template-input",
          placeholder: "optimism",
          required: false,
        },
        {
          key: "countryCode",
          label: "Country Code (Optional)",
          type: "template-input",
          placeholder: "PH",
          required: false,
        },
        {
          key: "paymentMethod",
          label: "Payment Method (Optional)",
          type: "template-input",
          placeholder: "banktransfer",
          required: false,
        },
        {
          key: "walletAddress",
          label: "Wallet Address (Optional)",
          type: "template-input",
          placeholder: "0x...",
          required: false,
          isAddressField: true,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether initiation succeeded" },
        { field: "conversionReference", description: "Internal conversion reference ID" },
        { field: "status", description: "Initial conversion status" },
        { field: "redirectUrl", description: "Provider redirect URL (when available)" },
        { field: "payload", description: "Provider-specific initiation payload" },
        { field: "notes", description: "Execution notes for downstream steps" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-supported-corridors",
      label: "Get Supported Corridors",
      description:
        "Fetch country/currency availability data for off-ramp provider corridors",
      category: "Offramp",
      stepFunction: "getSupportedCorridorsStep",
      stepImportPath: "get-supported-corridors",
      configFields: [
        {
          key: "providerMode",
          label: "Provider Mode",
          type: "select",
          options: [
            { value: "auto", label: "Auto (All Providers)" },
            { value: "onramper", label: "Onramper" },
            { value: "transak", label: "Transak" },
          ],
          defaultValue: "auto",
          required: true,
        },
        {
          key: "networkMode",
          label: "Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet / Staging" },
            { value: "mainnet", label: "Mainnet / Production" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "countryCode",
          label: "Country Code (Optional)",
          type: "template-input",
          placeholder: "NG",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether corridor lookup succeeded" },
        { field: "providers", description: "Per-provider corridor payloads" },
        { field: "count", description: "Number of providers with data" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-conversion-status",
      label: "Get Conversion Status",
      description:
        "Poll conversion status via provider APIs or an external status endpoint",
      category: "Offramp",
      stepFunction: "getConversionStatusStep",
      stepImportPath: "get-conversion-status",
      configFields: [
        {
          key: "provider",
          label: "Provider",
          type: "select",
          options: [
            { value: "onramper", label: "Onramper" },
            { value: "transak", label: "Transak" },
          ],
          defaultValue: "transak",
          required: true,
        },
        {
          key: "networkMode",
          label: "Environment",
          type: "select",
          options: [
            { value: "testnet", label: "Testnet / Staging" },
            { value: "mainnet", label: "Mainnet / Production" },
          ],
          defaultValue: "testnet",
          required: true,
        },
        {
          key: "orderId",
          label: "Provider Order ID (Optional)",
          type: "template-input",
          placeholder: "uuid",
          required: false,
        },
        {
          key: "statusEndpoint",
          label: "External Status Endpoint (Optional)",
          type: "template-input",
          placeholder: "https://example.com/status/123",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether status polling succeeded" },
        { field: "status", description: "Current conversion status" },
        { field: "details", description: "Raw provider or endpoint payload" },
        { field: "error", description: "Error message if failed" },
      ],
    },
  ],
};

registerIntegration(offrampPlugin);

export default offrampPlugin;
