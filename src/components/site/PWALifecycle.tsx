import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { registerServiceWorker } from "@/lib/pwa/register";

/**
 * Registers the production PWA lifecycle.
 * Release updates activate automatically; dynamic data is refreshed on reconnect.
 */
export function PWALifecycle() {
  const queryClient = useQueryClient();

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => queryClient.invalidateQueries();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [queryClient]);

  return null;
}
