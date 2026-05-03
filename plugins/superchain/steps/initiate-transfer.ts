import "server-only";

import { ethers } from "ethers";
import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { initializeWalletSigner } from "@/lib/para/wallet-helpers";
import { getRpcProvider } from "@/lib/rpc/provider-factory";
import { resolveOrganizationContext } from "@/lib/web3/resolve-org-context";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { SuperchainCredentials } from "../credentials";
import { acrossGet } from "./superchain-core";
import { validateAcrossRouteInputs } from "./route-preflight";

type AcrossSwapPayload = {
  approvalTxns?: Array<{
    to: string;
    data: string;
    value?: string;
    [key: string]: unknown;
  }>;
  swapTx?: {
    to: string;
    data: string;
    value?: string;
    gas?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    [key: string]: unknown;
  };
  expectedFillTime?: number;
  quoteExpiryTimestamp?: number;
  id?: string;
  checks?: {
    allowance?: {
      token?: string;
      spender?: string;
      actual?: string;
      expected?: string;
    };
  };
  [key: string]: unknown;
};

type InitiateTransferResult =
  | {
      success: true;
      prepared: true;
      executed: boolean;
      approvalTxns: unknown[];
      swapTx: AcrossSwapPayload["swapTx"];
      expectedFillTime?: number;
      quoteExpiryTimestamp?: number;
      quoteId?: string;
      depositTxnRef?: string;
      notes: string;
    }
  | { success: false; error: string };

export type InitiateTransferInput = StepInput & {
  networkMode?: "mainnet" | "testnet";
  tradeType?: "exactInput" | "minOutput";
  originChainId: string;
  destinationChainId: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  depositor: string;
  recipient?: string;
  slippage?: string;
  executeOnchain?: string;
  integratorId?: string;
  integrationId?: string;
};

async function stepHandler(
  input: InitiateTransferInput,
  credentials: SuperchainCredentials
): Promise<InitiateTransferResult> {
  try {
    await validateAcrossRouteInputs(
      {
        networkMode: input.networkMode,
        originChainId: input.originChainId,
        destinationChainId: input.destinationChainId,
        inputToken: input.inputToken,
        outputToken: input.outputToken,
      },
      credentials
    );

    const payload = await acrossGet<AcrossSwapPayload>(
      input.networkMode,
      "/swap/approval",
      {
        tradeType: input.tradeType || "exactInput",
        originChainId: input.originChainId,
        destinationChainId: input.destinationChainId,
        inputToken: input.inputToken,
        outputToken: input.outputToken,
        amount: input.amount,
        depositor: input.depositor,
        recipient: input.recipient || input.depositor,
        slippage: input.slippage,
        integratorId: input.integratorId,
      },
      credentials
    );

    if (!payload.swapTx) {
      return {
        success: false,
        error: "Across API did not return swap transaction payload",
      };
    }

    const shouldExecute = String(input.executeOnchain).toLowerCase() === "true";
    if (!shouldExecute) {
      return {
        success: true,
        prepared: true,
        executed: false,
        approvalTxns: Array.isArray(payload.approvalTxns) ? payload.approvalTxns : [],
        swapTx: payload.swapTx,
        expectedFillTime: payload.expectedFillTime,
        quoteExpiryTimestamp: payload.quoteExpiryTimestamp,
        quoteId: payload.id,
        notes:
          "Transfer payload prepared. Set executeOnchain=true to broadcast swapTx and get a deposit transaction hash.",
      };
    }

    const orgCtx = await resolveOrganizationContext(
      input._context ?? {},
      "[Superchain Initiate Transfer]",
      "initiate-transfer"
    );
    if (!orgCtx.success) {
      return { success: false, error: orgCtx.error };
    }
    const { organizationId, userId } = orgCtx;

    const originChainId = Number.parseInt(input.originChainId, 10);
    if (!Number.isFinite(originChainId)) {
      return { success: false, error: "originChainId must be a valid number" };
    }

    const rpcManager = await getRpcProvider({ chainId: originChainId, userId });
    const rpcUrl = await rpcManager.resolveActiveRpcUrl();
    const signer = await initializeWalletSigner(organizationId, rpcUrl, originChainId);
    let nextNonce = await signer.getNonce("pending");

    const swapTx = payload.swapTx;
    const approvalTxns = Array.isArray(payload.approvalTxns)
      ? payload.approvalTxns
      : [];

    if (approvalTxns.length > 0) {
      for (const approvalTx of approvalTxns) {
        const approvalResponse = await signer.sendTransaction({
          to: approvalTx.to,
          data: approvalTx.data,
          value: approvalTx.value ? BigInt(approvalTx.value) : undefined,
          nonce: nextNonce,
        });
        nextNonce += 1;
        await approvalResponse.wait();
      }
    } else {
      const allowance = payload.checks?.allowance;
      const expected = allowance?.expected ? BigInt(allowance.expected) : BigInt(0);
      const actual = allowance?.actual ? BigInt(allowance.actual) : BigInt(0);
      if (
        expected > BigInt(0) &&
        actual < expected &&
        allowance?.token &&
        allowance?.spender
      ) {
        const erc20 = new ethers.Interface([
          "function approve(address spender, uint256 amount) returns (bool)",
        ]);
        const data = erc20.encodeFunctionData("approve", [
          allowance.spender,
          expected,
        ]);
        const approvalResponse = await signer.sendTransaction({
          to: allowance.token,
          data,
          value: BigInt(0),
          nonce: nextNonce,
        });
        nextNonce += 1;
        await approvalResponse.wait();
      }
    }

    const txRequest = {
      to: swapTx.to,
      data: swapTx.data,
      value: swapTx.value ? BigInt(swapTx.value) : undefined,
      nonce: nextNonce,
    };

    const txResponse = await signer.sendTransaction(txRequest);
    await txResponse.wait();

    return {
      success: true,
      prepared: true,
      executed: true,
      approvalTxns,
      swapTx: payload.swapTx,
      expectedFillTime: payload.expectedFillTime,
      quoteExpiryTimestamp: payload.quoteExpiryTimestamp,
      quoteId: payload.id,
      depositTxnRef: txResponse.hash,
      notes: "Across swap transaction broadcast successfully.",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initiate transfer: ${getErrorMessage(error)}`,
    };
  }
}

export async function initiateTransferStep(
  input: InitiateTransferInput
): Promise<InitiateTransferResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("superchain/initiate-transfer requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as SuperchainCredentials;

  return withPluginMetrics(
    {
      pluginName: "superchain",
      actionName: "initiate-transfer",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}
initiateTransferStep.maxRetries = 0;

export const _integrationType = "superchain";
