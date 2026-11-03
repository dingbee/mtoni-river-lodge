/**
 * Production service-worker registration.
 *
 * The service worker is the only client-side release cache. New workers
 * activate automatically so users do not remain pinned to an older UI.
 * Network-first document navigation has no timeout: online users always
 * receive the current deployment; cached documents are an offline fallback.
 */
import type { Workbox } from "workbox-window";

const SW_URL = "/sw.js";

function shouldSkipRegistration(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return new URLSearchParams(window.location.search).get("sw") === "off";
}

async function unregisterMatching(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => {
      const url = r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL ?? "";
      return url.endsWith(SW_URL);
    }).map((r) => r.unregister().catch(() => false)));
  } catch {
    /* Non-fatal: registration cleanup must never block application startup. */
  }
}

export type PWAUpdateHandler = (wb: Workbox) => void;

export async function registerServiceWorker(onUpdateAvailable?: PWAUpdateHandler): Promise<void> {
  if (shouldSkipRegistration()) {
    await unregisterMatching();
    return;
  }
  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox(SW_URL, { scope: "/", updateViaCache: "none" });
    wb.addEventListener("waiting", () => {
      // Auto-update workers should not wait for a user prompt. This is a
      // defensive path for an already-waiting worker from an older release.
      onUpdateAvailable?.(wb);
      wb.messageSkipWaiting();
    });
    wb.addEventListener("controlling", () => window.location.reload());
    await wb.register();
    await wb.update().catch(() => undefined);
  } catch (err) {
    console.warn("[pwa] service worker registration failed", err);
  }
}

export function applyPendingUpdate(wb: Workbox): void {
  wb.messageSkipWaiting();
}
