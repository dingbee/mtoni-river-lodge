import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractErrorMessage } from "@/hooks/use-admin-mutation";

/**
 * Global error boundary for authenticated admin routes.
 *
 * Used as the `errorComponent` on the /_authenticated/admin layout so any
 * loader / render error inside the admin surface is caught and shown with
 * a consistent shell — never a blank page.
 */
export function AdminErrorBoundary({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const message = extractErrorMessage(error, "This admin screen failed to load.");
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div role="alert" className="os-card p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-[color:var(--os-danger-soft)] text-[color:var(--os-danger)]">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl text-[color:var(--os-ink)]">Something went wrong</h1>
            <p className="text-xs text-[color:var(--os-ink-3)]">An unexpected error occurred in the admin console.</p>
          </div>
        </div>
        <pre className="mt-5 max-h-40 overflow-auto rounded-md border border-[color:var(--os-hairline)] bg-[color:var(--os-surface-2)] p-3 text-xs text-[color:var(--os-ink-2)] whitespace-pre-wrap">
          {message}
        </pre>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              reset();
              router.invalidate();
            }}
          >
            <RefreshCw className="mr-2 size-3.5" /> Try again
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.history.back()}>
            Go back
          </Button>
        </div>
      </div>
    </div>
  );
}