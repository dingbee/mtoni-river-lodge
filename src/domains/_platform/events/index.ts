export * from "./types";
export { eventBus } from "./bus";
export { emitPlatformEvent } from "./emit.functions";

import { eventBus } from "./bus";
import { emitPlatformEvent } from "./emit.functions";
import { dispatchEvent as dispatchAutomation } from "@/domains/automation/automation.functions";
import type { PlatformEvent, PlatformEventType } from "./types";

/** Generate a client-side event id. Uses crypto.randomUUID when available. */
function newId(): string {
  const g: any = globalThis;
  return g.crypto?.randomUUID?.() ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Emit a platform event locally (in-process bus) AND persist it to
 * activity_logs via the server function. Persist errors are logged but
 * never thrown to the caller — event emission must not break workflows.
 */
export async function publishEvent(input: Omit<PlatformEvent, "id" | "at"> & { id?: string; at?: string }): Promise<void> {
  const event: PlatformEvent = {
    id: input.id ?? newId(),
    at: input.at ?? new Date().toISOString(),
    ...input,
    severity: input.severity ?? "info",
  };
  eventBus.emit(event);
  try {
    await emitPlatformEvent({ data: {
      type: event.type,
      module: event.module,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      entityLabel: event.entityLabel ?? null,
      meta: event.meta ?? {},
      severity: event.severity,
      correlationId: event.correlationId ?? null,
    }});
  } catch (err) {
    console.warn("[events] failed to persist", event.type, err);
  }
  // Fan out to automation engine (best-effort).
  try {
    await dispatchAutomation({ data: {
      type: event.type,
      module: event.module,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      meta: event.meta ?? {},
      correlationId: event.correlationId ?? null,
    }});
  } catch (err) {
    console.warn("[events] automation dispatch failed", event.type, err);
  }
}

/** Convenience typed subscribe. */
export function subscribe(type: PlatformEventType | "*", handler: (e: PlatformEvent) => void) {
  return eventBus.on(type, handler);
}
