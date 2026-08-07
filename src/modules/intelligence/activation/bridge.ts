/**
 * Intelligence bridge — subscribes to the existing platform Event Bus and
 * forwards mapped events into the Intelligence Core. Best-effort: a failure
 * here never affects the emitting module.
 */
import { eventBus } from "@/domains/_platform/events/bus";
import type { PlatformEvent } from "@/domains/_platform/events/types";
import { mapPlatformEvent } from "./event-map";
import { ingestPlatformIntelligenceEvent } from "./activation.functions";

let installed = false;

export function installIntelligenceBridge(): () => void {
  if (installed) return () => {};
  installed = true;
  const off = eventBus.on("*", (event: PlatformEvent) => {
    if (!mapPlatformEvent(event.type)) return;
    void ingestPlatformIntelligenceEvent({
      data: {
        eventId: event.id,
        type: event.type,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        meta: (event.meta ?? {}) as Record<string, unknown>,
        occurredAt: event.at ?? null,
      },
    }).catch((err) => console.warn("[intelligence] event ingest failed", event.type, err));
  });
  return () => {
    installed = false;
    off();
  };
}