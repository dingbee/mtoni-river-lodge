import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Building2, CreditCard, FileText, ShieldCheck } from "lucide-react";
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

const workspaces = [
  {
    to: "/admin/commercial",
    title: "Commercial Control Centre",
    description: "Manage approved catalogue, pricing, package composition, trial policy and commercial account lifecycle.",
    Icon: CreditCard,
  },
  {
    to: "/admin/website-demo-requests",
    title: "Website Enquiries",
    description: "Review demo requests and commercial enquiries submitted through StayNas.com.",
    Icon: FileText,
  },
  {
    to: "/admin/ai/concierge/providers",
    title: "Provider Routing",
    description: "Manage platform-level provider routing and property bindings.",
    Icon: Building2,
  },
  {
    to: "/admin/ai/activity",
    title: "Platform AI Activity",
    description: "Review platform-wide AI activity and audit evidence.",
    Icon: ShieldCheck,
  },
] as const;

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
        <section className="grid gap-4 md:grid-cols-2" aria-label="Founder workspaces">
          {workspaces.map(({ to, title, description, Icon }) => (
            <Link key={to} to={to as any} className="group flex gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
              </span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          ))}
        </section>
        <footer className="border-t pt-5 text-xs text-muted-foreground">
          Founder access is checked server-side through the CC-03 commercial founder authority contract. Each privileged destination must continue to enforce its own authorization.
        </footer>
      </div>
    </main>
  );
}
