import type { EventListener, PlatformEvent, PlatformEventType } from "./types";

/** In-memory pub/sub. SSR-safe (no window references). */
class EventBus {
  private byType = new Map<PlatformEventType | "*", Set<EventListener>>();

  on(type: PlatformEventType | "*", listener: EventListener): () => void {
    let set = this.byType.get(type);
    if (!set) { set = new Set(); this.byType.set(type, set); }
    set.add(listener);
    return () => this.off(type, listener);
  }
  off(type: PlatformEventType | "*", listener: EventListener): void {
    this.byType.get(type)?.delete(listener);
  }
  emit(event: PlatformEvent): void {
    this.byType.get(event.type)?.forEach((l) => {
      try { l(event); } catch (err) { console.error("[event-bus] listener failed", event.type, err); }
    });
    this.byType.get("*")?.forEach((l) => {
      try { l(event); } catch (err) { console.error("[event-bus] listener failed", event.type, err); }
    });
  }
}

export const eventBus = new EventBus();
