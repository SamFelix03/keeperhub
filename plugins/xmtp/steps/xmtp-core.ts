import "server-only";

import { dirname, extname } from "node:path";
import { mkdirSync } from "node:fs";
import { TurnkeySigner } from "@turnkey/ethers";
import {
  Client,
  type Identifier,
  type Signer,
  type XmtpEnv,
} from "@xmtp/node-sdk";
import { toChecksumAddress } from "@/lib/address-utils";
import { getOrganizationWallet } from "@/lib/para/wallet-helpers";
import { getTurnkeySignerConfig } from "@/lib/turnkey/turnkey-client";

const DEFAULT_XMTP_ENV: XmtpEnv = "dev";

export type XmtpSendResult = {
  senderAddress: string;
  recipientAddress: string;
  conversationId: string;
  messageId?: string;
};

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length === 0) {
    return new Uint8Array();
  }
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex signature length");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    const pair = normalized.slice(i, i + 2);
    const value = Number.parseInt(pair, 16);
    if (Number.isNaN(value)) {
      throw new Error("Invalid hex signature value");
    }
    bytes[i / 2] = value;
  }
  return bytes;
}

export function resolveXmtpEnv(env?: string): XmtpEnv {
  switch (env) {
    case "local":
      return "local";
    case "production":
    case "mainnet":
      return "production";
    case "dev":
    case "testnet":
    case "testnet-dev":
    case "testnet-staging":
      return "dev";
    default:
      return DEFAULT_XMTP_ENV;
  }
}

export function toXmtpIdentifier(address: string): Identifier {
  return {
    identifier: toChecksumAddress(address).toLowerCase(),
    // node-bindings uses IdentifierKind.Ethereum = 0
    identifierKind: 0 as Identifier["identifierKind"],
  };
}

function getDefaultDbPath(organizationId: string): string {
  const root = "/tmp/keeperhub-xmtp";
  return `${root.replace(/\/+$/, "")}/${organizationId}/xmtp.db`;
}

function resolveSqliteDbFilePath(dbPath: string): string {
  const normalized = dbPath.trim().replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("XMTP dbPath cannot be empty");
  }
  return extname(normalized).toLowerCase() === ".db"
    ? normalized
    : `${normalized}/xmtp.db`;
}

function ensureDbParentPath(dbFilePath: string): void {
  mkdirSync(dirname(dbFilePath), { recursive: true });
}

export async function createXmtpClientForOrganization(params: {
  organizationId: string;
  env?: string;
  dbPath?: string;
}): Promise<{
  client: Awaited<ReturnType<typeof Client.create>>;
  senderAddress: string;
}> {
  const wallet = await getOrganizationWallet(params.organizationId);
  if (wallet.provider !== "turnkey") {
    throw new Error("XMTP requires a Turnkey-backed organization wallet");
  }
  if (!wallet.turnkeySubOrgId) {
    throw new Error("Turnkey wallet missing sub-organization ID");
  }

  const senderAddress = toChecksumAddress(wallet.walletAddress);
  const signerConfig = getTurnkeySignerConfig(
    wallet.turnkeySubOrgId,
    senderAddress
  );
  const turnkeySigner = new TurnkeySigner({
    client: signerConfig.client,
    organizationId: signerConfig.organizationId,
    signWith: signerConfig.signWith,
  });

  const signer: Signer = {
    type: "EOA",
    getIdentifier: () => toXmtpIdentifier(senderAddress),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const signature = await turnkeySigner.signMessage(message);
      if (typeof signature === "string") {
        return hexToBytes(signature);
      }
      throw new Error("Unsupported Turnkey signature format for XMTP signer");
    },
  };

  const env = resolveXmtpEnv(params.env);
  const dbPath = resolveSqliteDbFilePath(
    params.dbPath || getDefaultDbPath(params.organizationId)
  );
  ensureDbParentPath(dbPath);
  const client = await Client.create(
    signer,
    {
      env,
      dbPath,
    } as Parameters<typeof Client.create>[1]
  );

  return { client, senderAddress };
}

export async function sendXmtpTextMessage(params: {
  organizationId: string;
  recipientAddress: string;
  message: string;
  env?: string;
  dbPath?: string;
}): Promise<XmtpSendResult> {
  const { client, senderAddress } = await createXmtpClientForOrganization({
    organizationId: params.organizationId,
    env: params.env,
    dbPath: params.dbPath,
  });

  const recipientIdentifier = toXmtpIdentifier(params.recipientAddress);
  const canMessageMap = await client.canMessage([recipientIdentifier]);
  const isReachable = Array.from(canMessageMap.values()).some(Boolean);
  if (!isReachable) {
    throw new Error(
      `Recipient ${params.recipientAddress} is not currently reachable on XMTP`
    );
  }

  const dm = await client.conversations.createDmWithIdentifier(recipientIdentifier);
  const sent = (await dm.sendText(params.message)) as { id?: string } | undefined;

  return {
    senderAddress,
    recipientAddress: toChecksumAddress(params.recipientAddress),
    conversationId: dm.id,
    messageId: sent?.id,
  };
}
