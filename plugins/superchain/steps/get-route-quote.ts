import "server-only";

import { fetchCredentials } from "@/lib/credential-fetcher";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { getErrorMessage } from "@/lib/utils";
import type { SuperchainCredentials } from "../credentials";
import { acrossGet } from "./superchain-core";
import { validateAcrossRouteInputs } from "./route-preflight";

type AcrossSwapQuote = {
  approvalTxns?: unknown[];
  swapTx?: unknown;
  fees?: unknown;
  expectedFillTime?: number;
  quoteExpiryTimestamp?: number;
  id?: string;
  checks?: unknown;
  [key: string]: unknown;
};

type GetRouteQuoteResult =
  | {
      success: true;
      quote: AcrossSwapQuote;
      expectedFillTime?: number;
      quoteExpiryTimestamp?: number;
      approvalTxCount: number;
    }
  | { success: false; error: string };

export type GetRouteQuoteInput = StepInput & {
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
  integratorId?: string;
  integrationId?: string;
};

async function stepHandler(
  input: GetRouteQuoteInput,
  credentials: SuperchainCredentials
): Promise<GetRouteQuoteResult> {
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

    const quote = await acrossGet<AcrossSwapQuote>(
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

    return {
      success: true,
      quote,
      expectedFillTime: quote.expectedFillTime,
      quoteExpiryTimestamp: quote.quoteExpiryTimestamp,
      approvalTxCount: Array.isArray(quote.approvalTxns)
        ? quote.approvalTxns.length
        : 0,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch route quote: ${getErrorMessage(error)}`,
    };
  }
}

export async function getRouteQuoteStep(
  input: GetRouteQuoteInput
): Promise<GetRouteQuoteResult> {
  "use step";

  if (!input.integrationId) {
    throw new Error("superchain/get-route-quote requires integrationId");
  }
  const credentials = (await fetchCredentials(
    input.integrationId
  )) as SuperchainCredentials;

  return withPluginMetrics(
    {
      pluginName: "superchain",
      actionName: "get-route-quote",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input, credentials))
  );
}

export const _integrationType = "superchain";
