import type { IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { RequestFinanceIcon } from "./icon";

const requestFinancePlugin: IntegrationPlugin = {
  type: "request-finance",
  label: "Request Finance",
  description:
    "Track Request Finance invoice events and payment history through API-backed workflow steps",
  icon: RequestFinanceIcon,
  formFields: [
    {
      id: "apiKey",
      label: "Request Finance API Key",
      type: "password",
      placeholder: "rk_...",
      configKey: "REQUEST_FINANCE_API_KEY",
      envVar: "REQUEST_FINANCE_API_KEY",
      helpText: "API key from Request Finance developer settings.",
      helpLink: {
        text: "Request Finance API docs",
        url: "https://docs.request.finance/getting-started",
      },
    },
    {
      id: "baseUrl",
      label: "Base URL",
      type: "url",
      placeholder: "https://api.request.finance",
      configKey: "REQUEST_FINANCE_BASE_URL",
      envVar: "REQUEST_FINANCE_BASE_URL",
      helpText: "Override only when targeting a custom API environment.",
    },
    {
      id: "webhookSecret",
      label: "Webhook Secret (Optional)",
      type: "password",
      placeholder: "whsec_...",
      configKey: "REQUEST_FINANCE_WEBHOOK_SECRET",
      envVar: "REQUEST_FINANCE_WEBHOOK_SECRET",
      helpText:
        "Used by your webhook endpoint to validate X-Webhook-Signature payloads.",
    },
  ],
  testConfig: {
    getTestFunction: async () => {
      const { testRequestFinance } = await import("./test");
      return testRequestFinance;
    },
  },
  actions: [
    {
      slug: "subscribe-invoice-events",
      label: "Subscribe Invoice Events",
      description:
        "Prepare webhook subscription metadata for Request Finance invoice events",
      category: "Request Finance",
      stepFunction: "subscribeInvoiceEventsStep",
      stepImportPath: "subscribe-invoice-events",
      configFields: [
        {
          key: "webhookUrl",
          label: "Webhook URL",
          type: "template-input",
          placeholder: "https://example.com/webhooks/request-finance",
          required: true,
        },
        {
          key: "eventTypes",
          label: "Event Types (Optional)",
          type: "template-input",
          placeholder: "create,accept,cancel,reject,paid",
          required: false,
        },
        {
          key: "variant",
          label: "Variant (Optional)",
          type: "select",
          options: [
            { value: "rnf_invoice", label: "Invoice" },
            { value: "rnf_salary", label: "Salary" },
          ],
          defaultValue: "rnf_invoice",
          required: false,
        },
        {
          key: "walletAddress",
          label: "Wallet Address Filter (Optional)",
          type: "template-input",
          placeholder: "0x...",
          required: false,
          isAddressField: true,
        },
        {
          key: "pollIntervalSeconds",
          label: "Fallback Poll Interval Seconds (Optional)",
          type: "number",
          min: 10,
          defaultValue: "30",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether setup preparation succeeded" },
        { field: "subscription", description: "Prepared webhook subscription details" },
        { field: "notes", description: "Setup and signature-verification notes" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-payment-history",
      label: "Get Payment History",
      description:
        "Fetch Request Finance invoice history and status distribution via the invoices API",
      category: "Request Finance",
      stepFunction: "getPaymentHistoryStep",
      stepImportPath: "get-payment-history",
      configFields: [
        {
          key: "take",
          label: "Take",
          type: "number",
          min: 1,
          max: 100,
          defaultValue: "25",
          required: false,
        },
        {
          key: "skip",
          label: "Skip",
          type: "number",
          min: 0,
          defaultValue: "0",
          required: false,
        },
        {
          key: "status",
          label: "Status Filter (Optional)",
          type: "template-input",
          placeholder: "paid,open",
          required: false,
        },
        {
          key: "search",
          label: "Search (Optional)",
          type: "template-input",
          placeholder: "invoice number or tx hash",
          required: false,
        },
        {
          key: "filterBy",
          label: "Direction (Optional)",
          type: "select",
          options: [
            { value: "sent", label: "Sent" },
            { value: "received", label: "Received" },
          ],
          required: false,
        },
        {
          key: "variant",
          label: "Variant (Optional)",
          type: "select",
          options: [
            { value: "rnf_invoice", label: "Invoice" },
            { value: "rnf_salary", label: "Salary" },
          ],
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether history retrieval succeeded" },
        { field: "invoices", description: "Filtered invoice history list" },
        { field: "count", description: "Number of invoices returned" },
        {
          field: "statuses",
          description: "Invoice count grouped by status (paid/open/etc.)",
        },
        { field: "raw", description: "Raw API response payload" },
        { field: "error", description: "Error message if failed" },
      ],
    },
  ],
};

registerIntegration(requestFinancePlugin);

export default requestFinancePlugin;
