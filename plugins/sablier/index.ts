import type { IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { SablierIcon } from "./icon";

const sablierPlugin: IntegrationPlugin = {
  type: "sablier",
  label: "Sablier",
  description: "Monitor Sablier streams and read unlockable stream balances",
  icon: SablierIcon,
  requiresCredentials: false,
  formFields: [],
  actions: [
    {
      slug: "subscribe-to-stream-events",
      label: "Subscribe To Stream Events",
      description:
        "Prepare a webhook subscription config for Sablier stream event monitoring",
      category: "Sablier",
      stepFunction: "subscribeToStreamEventsStep",
      stepImportPath: "subscribe-to-stream-events",
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          placeholder: "Select network",
          required: true,
        },
        {
          key: "lockupContractAddress",
          label: "Sablier Lockup Contract Address",
          type: "template-input",
          placeholder: "0x...",
          required: true,
          isAddressField: true,
        },
        {
          key: "webhookUrl",
          label: "Webhook URL",
          type: "template-input",
          placeholder: "https://example.com/webhook/sablier",
          required: true,
        },
        {
          key: "walletAddress",
          label: "Wallet Address Filter (Optional)",
          type: "template-input",
          placeholder: "0x... recipient/sender filter",
          required: false,
          isAddressField: true,
        },
        {
          key: "eventTypes",
          label: "Event Types (Optional)",
          type: "template-input",
          placeholder: "create,withdraw,cancel",
          required: false,
        },
        {
          key: "fromBlock",
          label: "From Block (Optional)",
          type: "template-input",
          placeholder: "latest block number",
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
      ],
      outputFields: [
        { field: "success", description: "Whether setup preparation succeeded" },
        { field: "subscription", description: "Prepared subscription payload" },
        { field: "notes", description: "Operational notes for webhook relay setup" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-stream-state",
      label: "Get Stream State",
      description:
        "Read stream status, deposited/withdrawn amounts, and remaining balance from Sablier lockup contracts",
      category: "Sablier",
      stepFunction: "getStreamStateStep",
      stepImportPath: "get-stream-state",
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          placeholder: "Select network",
          required: true,
        },
        {
          key: "lockupContractAddress",
          label: "Sablier Lockup Contract Address",
          type: "template-input",
          placeholder: "0x...",
          required: true,
          isAddressField: true,
        },
        {
          key: "streamId",
          label: "Stream ID",
          type: "template-input",
          placeholder: "12345",
          required: true,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether the read succeeded" },
        { field: "status", description: "Human-readable stream status" },
        { field: "statusCode", description: "Status code from statusOf()" },
        { field: "depositedAmount", description: "Total deposited amount" },
        { field: "withdrawnAmount", description: "Total withdrawn amount" },
        { field: "refundedAmount", description: "Total refunded amount" },
        { field: "remainingAmount", description: "Remaining stream balance" },
        { field: "unlockableAmount", description: "Current withdrawable amount" },
        { field: "sender", description: "Stream sender address" },
        { field: "recipient", description: "Stream recipient address" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-unlockable-amount",
      label: "Get Unlockable Amount",
      description: "Return how much can be withdrawn from a Sablier stream now",
      category: "Sablier",
      stepFunction: "getUnlockableAmountStep",
      stepImportPath: "get-unlockable-amount",
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          placeholder: "Select network",
          required: true,
        },
        {
          key: "lockupContractAddress",
          label: "Sablier Lockup Contract Address",
          type: "template-input",
          placeholder: "0x...",
          required: true,
          isAddressField: true,
        },
        {
          key: "streamId",
          label: "Stream ID",
          type: "template-input",
          placeholder: "12345",
          required: true,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether the read succeeded" },
        { field: "withdrawableAmount", description: "Amount withdrawable now" },
        { field: "status", description: "Current stream status" },
        { field: "statusCode", description: "Status code from statusOf()" },
        { field: "error", description: "Error message if failed" },
      ],
    },
  ],
};

registerIntegration(sablierPlugin);

export default sablierPlugin;
