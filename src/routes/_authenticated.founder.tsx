import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, CreditCard } from "lucide-react";
import { getCommercialFounderStatus } from "@/domains/_platform/founder-admin.functions";

export const Route = createFileRoute("/_authenticated/founder")({
  head: () => ({
    meta: [
      { title: "Founder Workspace — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  component: FounderWorkspace,
});

function FounderWorkspace() {
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Platform administration</p>
          <h1 className="text-3xl font-semibold tracking-tight">Founder Workspace</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Platform-level controls for StayNas. This workspace is separate from tenant property operations and settings.
          </p>
        </header>
        <section aria-label="Founder workspaces">
          <Link to="/admin/commercial" className="group flex gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><CreditCard className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Commercial Control Centre</span>
              <span className="mt-1 block text-sm text-muted-foreground">Manage approved catalogue, pricing, package composition, trial policy and commercial account lifecycle.</span>
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </section>
        <footer className="border-t pt-5 text-xs text-muted-foreground">
          Founder access is checked server-side through the CC-03 commercial founder authority contract. Each privileged destination must continue to enforce its own authorization.
        </footer>
      </div>
    </main>
  );
}
