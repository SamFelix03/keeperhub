"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ProtocolCardV2 } from "@/components/hub/protocol-card-v2";
import type { GetIntegrationsResponse } from "@/app/api/integrations/route";
import type { ProtocolAction, ProtocolDefinition } from "@/lib/protocol-registry";
import { getIntegration } from "@/plugins/registry";

type ProtocolGridClientProps = {
  protocols: ProtocolDefinition[];
  workflowCounts: Record<string, number>;
};

function inferActionType(
  slug: string
): "read" | "write" {
  const lower = slug.toLowerCase();
  if (
    lower.startsWith("get-") ||
    lower.startsWith("check-") ||
    lower.startsWith("query-") ||
    lower.startsWith("poll-") ||
    lower.startsWith("subscribe-") ||
    lower.startsWith("parse-")
  ) {
    return "read";
  }
  return "write";
}

export function ProtocolGridClient({
  protocols,
  workflowCounts,
}: ProtocolGridClientProps): React.ReactElement {
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
          type: inferActionType(action.slug),
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

  const cards = useMemo(
    () => [...protocols, ...integrationProtocols],
    [protocols, integrationProtocols]
  );

  const handleSelect = useCallback(
    (slug: string): void => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("protocol", slug);
      if (!params.get("tab")) {
        params.set("tab", "protocols");
      }
      startTransition(() => {
        router.replace(`/hub?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((protocol) => (
        <ProtocolCardV2
          key={protocol.slug}
          onSelect={handleSelect}
          protocol={protocol}
          workflowCount={workflowCounts[protocol.slug] ?? 0}
        />
      ))}
    </div>
  );
}
