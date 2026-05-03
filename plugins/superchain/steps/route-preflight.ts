import "server-only";

import type { SuperchainCredentials } from "../credentials";
import { acrossGet } from "./superchain-core";

type AcrossChain = {
  chainId?: number;
  [key: string]: unknown;
};

type AcrossToken = {
  chainId?: number;
  address?: string;
  symbol?: string;
  displaySymbol?: string;
  [key: string]: unknown;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenMatches(token: AcrossToken, requestedToken: string): boolean {
  const candidate = normalize(requestedToken);
  const address = token.address ? normalize(token.address) : "";
  const symbol = token.symbol ? normalize(token.symbol) : "";
  const displaySymbol = token.displaySymbol ? normalize(token.displaySymbol) : "";
  return candidate === address || candidate === symbol || candidate === displaySymbol;
}

export async function validateAcrossRouteInputs(
  input: {
    networkMode?: "mainnet" | "testnet";
    originChainId: string;
    destinationChainId: string;
    inputToken: string;
    outputToken: string;
  },
  credentials: SuperchainCredentials
): Promise<void> {
  const [chainsRaw, tokensRaw, routesRaw] = await Promise.all([
    acrossGet<AcrossChain[]>(input.networkMode, "/swap/chains", {}, credentials),
    acrossGet<AcrossToken[]>(input.networkMode, "/swap/tokens", {}, credentials),
    acrossGet<unknown>(
      input.networkMode,
      "/available-routes",
      {
        originChainId: input.originChainId,
        destinationChainId: input.destinationChainId,
      },
      credentials
    ),
  ]);

  const chains = Array.isArray(chainsRaw) ? chainsRaw : [];
  const chainIds = new Set(chains.map((c) => c.chainId).filter((id): id is number => typeof id === "number"));
  const originChainId = Number(input.originChainId);
  const destinationChainId = Number(input.destinationChainId);
  const requestedInput = normalize(input.inputToken);
  const requestedOutput = normalize(input.outputToken);

  const tokens = Array.isArray(tokensRaw) ? tokensRaw : [];
  const originTokens = tokens.filter((t) => t.chainId === originChainId);
  const destinationTokens = tokens.filter((t) => t.chainId === destinationChainId);

  const routes = Array.isArray(routesRaw)
    ? routesRaw
    : Array.isArray((routesRaw as { routes?: unknown[] }).routes)
      ? (routesRaw as { routes: unknown[] }).routes
      : [];

  if (routes.length === 0) {
    throw new Error(
      `No Across routes available for ${input.originChainId} -> ${input.destinationChainId}`
    );
  }

  const routeMatches = routes.some((route) => {
    const r = route as Record<string, unknown>;
    const o = Number(r.originChainId ?? r.originChain ?? r.fromChainId);
    const d = Number(r.destinationChainId ?? r.destinationChain ?? r.toChainId);
    const it = normalize(String(r.inputToken ?? r.originToken ?? r.fromToken ?? ""));
    const ot = normalize(String(r.outputToken ?? r.destinationToken ?? r.toToken ?? ""));
    return o === originChainId && d === destinationChainId && it === requestedInput && ot === requestedOutput;
  });

  const routeChainPairExists = routes.some((route) => {
    const r = route as Record<string, unknown>;
    const o = Number(r.originChainId ?? r.originChain ?? r.fromChainId);
    const d = Number(r.destinationChainId ?? r.destinationChain ?? r.toChainId);
    return o === originChainId && d === destinationChainId;
  });

  if (!routeChainPairExists) {
    throw new Error(
      `No Across routes available for ${input.originChainId} -> ${input.destinationChainId}`
    );
  }

  // Prefer strict /swap/tokens validation when token matrix exists for both chains.
  // Fall back to /available-routes token pair matching if token matrix is stale/incomplete.
  const hasTokenMatrixForPair = originTokens.length > 0 && destinationTokens.length > 0;
  if (hasTokenMatrixForPair) {
    if (!originTokens.some((t) => tokenMatches(t, input.inputToken))) {
      throw new Error(
        `Input token ${input.inputToken} is not supported on origin chain ${input.originChainId}`
      );
    }
    if (!destinationTokens.some((t) => tokenMatches(t, input.outputToken))) {
      throw new Error(
        `Output token ${input.outputToken} is not supported on destination chain ${input.destinationChainId}`
      );
    }
  } else if (!routeMatches) {
    throw new Error(
      `Token pair ${input.inputToken} -> ${input.outputToken} is not available for route ${input.originChainId} -> ${input.destinationChainId}`
    );
  }

  // Soft-check /swap/chains only when chain list includes these testnets.
  if (chainIds.size > 0 && (!chainIds.has(originChainId) || !chainIds.has(destinationChainId))) {
    // Intentionally non-fatal: /swap/chains can lag /available-routes in some environments.
    return;
  }
}
