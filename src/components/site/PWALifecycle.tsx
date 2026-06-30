import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Workbox } from "workbox-window";
import { applyPendingUpdate, registerServiceWorker } from "@/lib/pwa/register";

/**
 * Mounts the PWA lifecycle:
 *  - Registers the service worker (guarded against dev/preview).
 *  - Surfaces an "update available" toast when a new version is waiting.
 *  - Invalidates TanStack Query caches when connectivity returns so
 *    dynamic content (availability, pricing, journal) refreshes seamlessly.
 */
export function PWALifecycle() {
  const queryClient = useQueryClient();
  const wbRef = useRef<Workbox | null>(null);
  const [, setUpdateReady] = useState(false);

  useEffect(() => {
    registerServiceWorker((wb) => {
      wbRef.current = wb;
      setUpdateReady(true);
      toast("A new version of Mtoni River Lodge is available.", {
        description: "Refresh to load the latest experience.",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => applyPendingUpdate(wb),
        },
      });
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let wasOffline = !navigator.onLine;

    const handleOnline = () => {
      // Refresh dynamic content once the browser reports connectivity.
      queryClient.invalidateQueries();
      if (wasOffline) {
        toast.success("You're back online.", {
          description: "Refreshing the latest availability and content.",
        });
      }
      wasOffline = false;
    };
    const handleOffline = () => {
      wasOffline = true;
      toast("You're offline.", {
        description: "Cached pages remain available while we reconnect.",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [queryClient]);

  return null;
}