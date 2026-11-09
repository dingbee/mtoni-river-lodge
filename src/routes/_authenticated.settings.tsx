import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CreditCard, Palette, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TenantSettings,
});

const sections = [
  { to: "/admin/settings/branding", title: "Property branding", description: "Manage the property's guest-facing identity and visual configuration.", Icon: Palette },
  { to: "/admin/settings/payment-providers", title: "Payment providers", description: "Manage payment integrations configured for this property.", Icon: CreditCard },
  { to: "/admin/staff/users", title: "Staff and users", description: "Review property staff accounts and access.", Icon: Users },
] as const;

function TenantSettings() {
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Property workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Manage your property's configuration, integrations and staff access. Platform-wide founder controls are kept in a separate workspace.</p>
        </header>
        <section className="grid gap-4 md:grid-cols-2" aria-label="Tenant settings">
          {sections.map(({ to, title, description, Icon }) => (
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
      </div>
    </main>
  );
}
