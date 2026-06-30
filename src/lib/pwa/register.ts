/**
 * Guarded service worker registration for Mtoni River Lodge.
 *
 * Follows the Lovable PWA skill:
 *  - Never registers in dev or Lovable preview contexts.
 *  - Honors `?sw=off` kill switch.
 *  - Single registrar; vite-plugin-pwa's auto-inject is disabled.
 *  - Notifies the caller when a waiting worker is ready (update prompt).
 */
import type { Workbox } from "workbox-window";

const SW_URL = "/sw.js";

function shouldSkipRegistration(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  if (!("serviceWorker" in navigator)) return true;
  if (!import.meta.env.PROD) return true;

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

  const params = new URLSearchParams(window.location.search);
  if (params.get("sw") === "off") return true;

  return false;
}

async function unregisterMatching(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL ?? "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister().catch(() => false)),
    );
  } catch {
    /* noop */
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
    const wb = new Workbox(SW_URL, { scope: "/" });

    wb.addEventListener("waiting", () => {
      onUpdateAvailable?.(wb);
    });

    wb.addEventListener("controlling", () => {
      // New SW took control after user accepted the update.
      window.location.reload();
    });

    await wb.register();
  } catch (err) {
    // Registration failures are non-fatal; log for visibility.
    // eslint-disable-next-line no-console
    console.warn("[pwa] service worker registration failed", err);
  }
}

/** Tell the waiting worker to activate, then reload via 'controlling'. */
export function applyPendingUpdate(wb: Workbox): void {
  wb.addEventListener("waiting", () => {
    wb.messageSkipWaiting();
  });
  wb.messageSkipWaiting();
}