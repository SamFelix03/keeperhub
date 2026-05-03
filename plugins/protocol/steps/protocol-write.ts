import "server-only";
import "@/protocols";
import { ethers } from "ethers";

import {
  type WriteContractCoreInput,
  type WriteContractResult,
  writeContractCore,
} from "@/plugins/web3/steps/write-contract-core";
import { resolveAbi } from "@/lib/abi/cache";
import { initializeWalletSigner } from "@/lib/para/wallet-helpers";
import { getRpcProvider } from "@/lib/rpc/provider-factory";
import { getProtocol } from "@/lib/protocol-registry";
import { resolveOrganizationContext } from "@/lib/web3/resolve-org-context";
import { type StepInput, withStepLogging } from "@/lib/workflow/executor/step-handler";
import { applyEncodeTransformsNamed } from "@/lib/protocol-encode-transforms";
import {
  type ProtocolMeta,
  resolveProtocolMeta,
} from "./resolve-protocol-meta";

type ProtocolWriteInput = StepInput & {
  network: string;
  contractAddress?: string;
  gasLimitMultiplier?: string;
  // KEEP-137: Private mempool routing (Flashbots Protect). Forwarded to writeContractCore.
  usePrivateMempool?: boolean;
  strict?: boolean;
  _protocolMeta?: string;
  _actionType?: string;
  [key: string]: unknown;
};

function buildFunctionArgs(
  input: ProtocolWriteInput,
  meta: ProtocolMeta
): string | undefined {
  const protocol = getProtocol(meta.protocolSlug);
  if (!protocol) {
    return undefined;
  }

  const protocolAction = protocol.actions.find(
    (a) => a.function === meta.functionName && a.contract === meta.contractKey
  );

  if (!protocolAction || protocolAction.inputs.length === 0) {
    return undefined;
  }

  const rawInputs = protocolAction.inputs.map((inp) => {
    const raw = input[inp.name];
    if (raw === undefined || raw === "") {
      return { name: inp.name, value: inp.default ?? "" };
    }
    const value = typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    return { name: inp.name, value };
  });

  const actionSlug = protocolAction.slug;
  const transformed = applyEncodeTransformsNamed(
    meta.protocolSlug,
    actionSlug,
    rawInputs
  );

  const args = transformed.map((t) => t.value);
  return JSON.stringify(args);
}

export async function protocolWriteStep(
  input: ProtocolWriteInput
): Promise<WriteContractResult> {
  "use step";

  return await withStepLogging(input, async () => {
    // 1. Resolve protocol metadata from config or action type
    const meta = resolveProtocolMeta(input);
    if (!meta) {
      return {
        success: false,
        error:
          "Invalid _protocolMeta: failed to parse JSON and could not derive from action type",
      };
    }

    // 2. Look up protocol definition from runtime registry
    const protocol = getProtocol(meta.protocolSlug);
    if (!protocol) {
      return {
        success: false,
        error: `Unknown protocol: ${meta.protocolSlug}`,
      };
    }

    // 3. Resolve contract for the selected network
    const contract = protocol.contracts[meta.contractKey];
    if (!contract) {
      return {
        success: false,
        error: `Unknown contract key "${meta.contractKey}" in protocol "${meta.protocolSlug}"`,
      };
    }

    const contractAddress = contract.userSpecifiedAddress
      ? input.contractAddress
      : contract.addresses[input.network];
    if (!contractAddress) {
      return {
        success: false,
        error: contract.userSpecifiedAddress
          ? `Missing contract address for "${meta.contractKey}" in protocol "${meta.protocolSlug}"`
          : `Protocol "${meta.protocolSlug}" contract "${meta.contractKey}" is not deployed on network "${input.network}"`,
      };
    }

    // 4. Resolve ABI (from definition or auto-fetch from explorer)
    let resolvedAbi: string;
    try {
      const abiResult = await resolveAbi({
        contractAddress,
        network: input.network,
        abi: contract.abi,
      });
      resolvedAbi = abiResult.abi;
    } catch (error) {
      return {
        success: false,
        error: `Failed to resolve ABI for contract "${meta.contractKey}" in protocol "${meta.protocolSlug}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 5. Build function arguments from named inputs ordered by action definition
    const functionArgs = buildFunctionArgs(input, meta);

    // Minimal DX guard: when running Aave V3 supply directly, ensure allowance
    // exists for the Pool spender so supply doesn't fail on missing approve.
    if (meta.protocolSlug === "aave-v3" && meta.functionName === "supply") {
      const asset = typeof input.asset === "string" ? input.asset : undefined;
      const amountRaw =
        typeof input.amount === "string" && input.amount.trim() !== ""
          ? BigInt(input.amount)
          : undefined;
      if (asset && ethers.isAddress(asset) && amountRaw && amountRaw > BigInt(0)) {
        const orgCtx = await resolveOrganizationContext(
          input._context ?? {},
          "[Protocol Write:Aave Supply]",
          "protocol-write"
        );
        if (!orgCtx.success) {
          return { success: false, error: orgCtx.error };
        }
        const { organizationId, userId } = orgCtx;
        const chainId = Number.parseInt(input.network, 10);
        const rpcManager = await getRpcProvider({ chainId, userId });
        const rpcUrl = await rpcManager.resolveActiveRpcUrl();
        const signer = await initializeWalletSigner(organizationId, rpcUrl, chainId);

        const erc20 = new ethers.Contract(
          asset,
          [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)",
          ],
          signer
        );
        const owner = await signer.getAddress();
        const current = (await erc20.allowance(owner, contractAddress)) as bigint;
        if (current < amountRaw) {
          const approveTx = await erc20.approve(contractAddress, amountRaw);
          await approveTx.wait();
        }
      }
    }

    // 6. Delegate to writeContractCore
    const ethValue =
      typeof input.ethValue === "string" && input.ethValue.trim() !== ""
        ? input.ethValue.trim()
        : undefined;

    const coreInput: WriteContractCoreInput = {
      contractAddress,
      network: input.network,
      abi: resolvedAbi,
      abiFunction: meta.functionName,
      functionArgs,
      ethValue,
      gasLimitMultiplier: input.gasLimitMultiplier,
      usePrivateMempool: input.usePrivateMempool,
      strict: input.strict,
      _context: input._context
        ? {
            executionId: input._context.executionId,
          }
        : undefined,
    };

    return await writeContractCore(coreInput);
  });
}

protocolWriteStep.maxRetries = 0;

export const _integrationType = "protocol";
