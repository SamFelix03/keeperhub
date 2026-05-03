"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { GetIntegrationsResponse } from "@/app/api/integrations/route";
import { ProtocolDetailModal } from "@/components/hub/protocol-detail-modal";
import type { ProtocolAction, ProtocolDefinition } from "@/lib/protocol-registry";
import { getIntegration } from "@/plugins/registry";

type ProtocolDetailIslandProps = {
  protocols: ProtocolDefinition[];
};

export function ProtocolDetailIsland({
  protocols,
}: ProtocolDetailIslandProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [integrations, setIntegrations] = useState<GetIntegrationsResponse>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/integrations");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as GetIntegrationsResponse;
        if (!cancelled) {
          setIntegrations(data);
        }
      } catch {
        if (!cancelled) {
          setIntegrations([]);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const integrationProtocols = useMemo<ProtocolDefinition[]>(() => {
    const deduped = new Map<string, GetIntegrationsResponse[number]>();
    for (const integration of integrations) {
      if (!deduped.has(integration.type)) {
        deduped.set(integration.type, integration);
      }
    }
    return Array.from(deduped.values())
      .map((integration) => ({
        integration,
        plugin: getIntegration(integration.type),
      }))
      .filter(
        (
          item
        ): item is {
          integration: GetIntegrationsResponse[number];
          plugin: NonNullable<ReturnType<typeof getIntegration>>;
        } => !!item.plugin
      )
      .sort((a, b) => a.plugin.label.localeCompare(b.plugin.label))
      .map(({ integration, plugin }) => {
        const actions: ProtocolAction[] = plugin.actions.map((action) => ({
          slug: action.slug,
          label: action.label,
          description: action.description,
          type:
            action.slug.startsWith("get-") ||
            action.slug.startsWith("check-") ||
            action.slug.startsWith("query-") ||
            action.slug.startsWith("poll-") ||
            action.slug.startsWith("subscribe-") ||
            action.slug.startsWith("parse-")
              ? "read"
              : "write",
          contract: "integration",
          function: action.slug,
          inputs: [],
          outputs: [],
        }));

        return {
          name: plugin.label,
          slug: integration.type,
          description: plugin.description,
          icon: `integration:${integration.type}`,
          contracts: {},
          actions,
          events: [],
        };
      });
  }, [integrations]);

  const selectedSlug = searchParams.get("protocol");
  const allProtocols = useMemo(
    () => [...protocols, ...integrationProtocols],
    [protocols, integrationProtocols]
  );
  const selectedProtocol = useMemo(
    () => allProtocols.find((p) => p.slug === selectedSlug) ?? null,
    [allProtocols, selectedSlug]
  );

  const handleOpenChange = useCallback(
    (open: boolean): void => {
      if (open) {
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.delete("protocol");
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/hub?${qs}` : "/hub", { scroll: false });
      });
    },
    [router, searchParams]
  );

  return (
    <ProtocolDetailModal
      onOpenChange={handleOpenChange}
      open={selectedProtocol !== null}
      protocol={selectedProtocol}
    />
  );
}
