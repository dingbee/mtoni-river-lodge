import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Palette,
  Sparkles,
  Mail,
  MessageSquare,
  Users,
  Activity,
  ShieldCheck,
  Building2,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { getBrandContext } from "@/domains/content/brand/brand.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SettingsHub,
});

type LinkTile = {
  to: string;
  title: string;
  description: string;
  Icon: typeof Sparkles;
  status?: string;
};

function SettingsHub() {
  const brandFn = useServerFn(getBrandContext);
  const brand = useQuery({ queryKey: ["settings.brand-summary"], queryFn: () => brandFn() });

  const property: LinkTile[] = [
    {
      to: "/admin/content/brand",
      title: "Brand & Identity",
      description: "Voice, tone, guest promise and brand tokens.",
      Icon: Palette,
    },
    {
      to: "/admin/content/pages",
      title: "Website Pages",
      description: "CMS content, SEO and hero blocks.",
      Icon: Building2,
    },
  ];
  const aiAndMessaging: LinkTile[] = [
    {
      to: "/admin/ai/settings",
      title: "Mtoni AI",
      description: "Model, tools and role scope for the AI Command Centre.",
      Icon: Sparkles,
    },
    {
      to: "/admin/ai/concierge/analytics",
      title: "Concierge Analytics",
      description: "Web / WhatsApp / Email concierge performance.",
      Icon: Activity,
    },
    {
      to: "/admin/guests/messages",
      title: "Messages & Channels",
      description: "Guest conversations across email and WhatsApp.",
      Icon: MessageSquare,
    },
  ];
  const access: LinkTile[] = [
    {
      to: "/admin/staff/users",
      title: "Staff & Users",
      description: "Team members and their access.",
      Icon: Users,
    },
    {
      to: "/admin/staff/roles",
      title: "Roles & Permissions",
      description: "Grant or revoke role assignments.",
      Icon: ShieldCheck,
    },
    {
      to: "/admin/staff/activity",
      title: "Activity Log",
      description: "Admin audit trail.",
      Icon: Activity,
    },
  ];
  const integrations: LinkTile[] = [
    {
      to: "/admin/system/health",
      title: "System Health",
      description: "Observability, retries and error rates.",
      Icon: Activity,
    },
    {
      to: "/admin/marketing/campaigns",
      title: "Email Campaigns",
      description: "Templates, sends and audiences.",
      Icon: Mail,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Property, integrations, access and preferences."
      />

      <SectionCard title="Property">
        <div className="grid gap-3 sm:grid-cols-2">
          <PropertyFact label="Rooms" value="24" hint="21 Riverfront Standard · 2 Deluxe · 1 Family" />
          <PropertyFact
            label="Currency"
            value="USD"
            hint="Base pricing currency for the booking engine"
          />
          <PropertyFact
            label="Brand tokens"
            value={brand.data ? String(Object.values(brand.data).reduce((n, arr) => n + (arr?.length ?? 0), 0)) : "—"}
            hint="Voice, tone and guest-promise tokens"
          />
          <PropertyFact
            label="Contact email"
            value="bookings@mtoniriverlodge.com"
            hint="Reservations inbox"
          />
        </div>
      </SectionCard>

      <TileGrid title="Content" tiles={property} />
      <TileGrid title="AI & Messaging" tiles={aiAndMessaging} />
      <TileGrid title="Access" tiles={access} />
      <TileGrid title="Integrations & System" tiles={integrations} />
    </div>
  );
}

function PropertyFact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-[color:var(--os-hairline)] bg-[color:var(--os-surface-2)] p-3">
      <div className="text-[10px] uppercase tracking-widest text-[color:var(--os-ink-3)]">{label}</div>
      <div className="mt-1 text-sm text-[color:var(--os-ink)]">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[color:var(--os-ink-3)]">{hint}</div>}
    </div>
  );
}

function TileGrid({ title, tiles }: { title: string; tiles: LinkTile[] }) {
  return (
    <SectionCard title={title}>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group flex items-start gap-3 rounded-md border border-[color:var(--os-hairline)] bg-[color:var(--os-surface-2)] p-3 transition hover:border-[color:var(--os-ink-3)]"
          >
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-[color:var(--os-surface)] text-[color:var(--os-ink-2)]">
              <t.Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm text-[color:var(--os-ink)]">{t.title}</div>
                {t.status && <Badge variant="secondary">{t.status}</Badge>}
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs text-[color:var(--os-ink-3)]">{t.description}</div>
            </div>
            <ArrowRight className="mt-1 size-4 flex-none text-[color:var(--os-ink-3)] transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
