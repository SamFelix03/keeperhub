import type { IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { PersonaIcon } from "./icon";

const personaPlugin: IntegrationPlugin = {
  type: "persona",
  label: "Persona",
  description:
    "Check KYC verification state, create inquiries, and gate off-ramp execution by compliance status",
  icon: PersonaIcon,
  formFields: [
    {
      id: "apiKey",
      label: "Persona API Key",
      type: "password",
      placeholder: "persona_...",
      configKey: "PERSONA_API_KEY",
      envVar: "PERSONA_API_KEY",
      helpText: "Bearer token used for Persona REST API requests.",
      helpLink: {
        text: "Persona API docs",
        url: "https://docs.withpersona.com",
      },
    },
    {
      id: "baseUrl",
      label: "Base URL (Optional)",
      type: "url",
      placeholder: "https://withpersona.com/api/v1",
      configKey: "PERSONA_BASE_URL",
      envVar: "PERSONA_BASE_URL",
      helpText: "Override only when targeting a custom Persona API environment.",
    },
    {
      id: "webhookSecret",
      label: "Webhook Secret (Optional)",
      type: "password",
      placeholder: "whsec_...",
      configKey: "PERSONA_WEBHOOK_SECRET",
      envVar: "PERSONA_WEBHOOK_SECRET",
      helpText: "Used by your webhook endpoint to validate Persona callbacks.",
    },
  ],
  testConfig: {
    getTestFunction: async () => {
      const { testPersona } = await import("./test");
      return testPersona;
    },
  },
  actions: [
    {
      slug: "check-verification-status",
      label: "Check Verification Status",
      description:
        "Return KYC status, tier, and corridor/limits hints for a wallet or email",
      category: "Persona",
      stepFunction: "checkVerificationStatusStep",
      stepImportPath: "check-verification-status",
      configFields: [
        {
          key: "inquiryId",
          label: "Inquiry ID (Optional)",
          type: "template-input",
          placeholder: "inq_...",
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
        {
          key: "email",
          label: "Email (Optional)",
          type: "template-input",
          placeholder: "user@example.com",
          required: false,
        },
        {
          key: "referenceId",
          label: "Reference ID (Optional)",
          type: "template-input",
          placeholder: "user-123",
          required: false,
        },
        {
          key: "statusEndpoint",
          label: "Status Endpoint Override (Optional)",
          type: "template-input",
          placeholder: "https://withpersona.com/api/v1/inquiries?...",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether lookup succeeded" },
        {
          field: "status",
          description: "Verification status (not_started/pending/approved/declined)",
        },
        { field: "tier", description: "Verification tier if available" },
        { field: "corridors", description: "Cleared corridors if available" },
        { field: "limits", description: "Transaction limits if available" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "create-inquiry",
      label: "Create Inquiry",
      description:
        "Create a Persona KYC inquiry and return a one-time verification link",
      category: "Persona",
      stepFunction: "createInquiryStep",
      stepImportPath: "create-inquiry",
      configFields: [
        {
          key: "inquiryId",
          label: "Inquiry ID (Optional)",
          type: "template-input",
          placeholder: "inq_...",
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
        {
          key: "email",
          label: "Email (Optional)",
          type: "template-input",
          placeholder: "user@example.com",
          required: false,
        },
        {
          key: "referenceId",
          label: "Reference ID (Optional)",
          type: "template-input",
          placeholder: "user-123",
          required: false,
        },
        {
          key: "inquiryTemplateId",
          label: "Inquiry Template ID (Optional)",
          type: "template-input",
          placeholder: "itmpl_...",
          required: false,
        },
        {
          key: "redirectUri",
          label: "Redirect URI (Optional)",
          type: "template-input",
          placeholder: "https://app.example.com/kyc-complete",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether inquiry creation succeeded" },
        { field: "inquiryId", description: "Persona inquiry identifier" },
        { field: "inquiryUrl", description: "Verification URL for end user" },
        { field: "referenceId", description: "Reference id used for lookup" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-cleared-corridors",
      label: "Get Cleared Corridors",
      description:
        "Return country+currency corridors approved for the user's verification profile",
      category: "Persona",
      stepFunction: "getClearedCorridorsStep",
      stepImportPath: "get-cleared-corridors",
      configFields: [
        {
          key: "inquiryId",
          label: "Inquiry ID (Optional)",
          type: "template-input",
          placeholder: "inq_...",
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
        {
          key: "email",
          label: "Email (Optional)",
          type: "template-input",
          placeholder: "user@example.com",
          required: false,
        },
        {
          key: "referenceId",
          label: "Reference ID (Optional)",
          type: "template-input",
          placeholder: "user-123",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether retrieval succeeded" },
        { field: "status", description: "Verification status" },
        { field: "tier", description: "Verification tier if available" },
        { field: "corridors", description: "Cleared corridors list" },
        { field: "count", description: "Number of corridors returned" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "subscribe-verification-webhook",
      label: "Subscribe Verification Webhook",
      description:
        "Prepare Persona webhook subscription metadata for verification completion callbacks",
      category: "Persona",
      stepFunction: "subscribeVerificationWebhookStep",
      stepImportPath: "subscribe-verification-webhook",
      configFields: [
        {
          key: "webhookUrl",
          label: "Webhook URL",
          type: "template-input",
          placeholder: "https://example.com/webhooks/persona",
          required: true,
        },
        {
          key: "eventTypes",
          label: "Event Types (Optional)",
          type: "template-input",
          placeholder: "inquiry.approved,inquiry.completed",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether setup succeeded" },
        { field: "subscription", description: "Prepared subscription payload" },
        { field: "notes", description: "Signature verification notes" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-transaction-limits",
      label: "Get Transaction Limits",
      description:
        "Return daily/monthly transaction limits based on user's verification tier",
      category: "Persona",
      stepFunction: "getTransactionLimitsStep",
      stepImportPath: "get-transaction-limits",
      configFields: [
        {
          key: "walletAddress",
          label: "Wallet Address (Optional)",
          type: "template-input",
          placeholder: "0x...",
          required: false,
          isAddressField: true,
        },
        {
          key: "email",
          label: "Email (Optional)",
          type: "template-input",
          placeholder: "user@example.com",
          required: false,
        },
        {
          key: "referenceId",
          label: "Reference ID (Optional)",
          type: "template-input",
          placeholder: "user-123",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether retrieval succeeded" },
        { field: "status", description: "Verification status" },
        { field: "tier", description: "Verification tier if available" },
        { field: "limits", description: "Daily/monthly transaction limits" },
        { field: "error", description: "Error message if failed" },
      ],
    },
  ],
};

registerIntegration(personaPlugin);

export default personaPlugin;
