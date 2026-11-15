import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CreditCard, Palette, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [{ title: "Settings â€” StayNas" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: TenantSettings,
});

const sections = [
  {
    to: "/admin/settings/branding",
    title: "Property branding",
    description: "Manage the property's guest-facing identity and visual configuration.",
    Icon: Palette,
  },
  {
    to: "/admin/settings/payment-providers",
    title: "Payment providers",
    description: "Manage payment integrations configured for this property.",
    Icon: CreditCard,
  },
  {
    to: "/admin/staff/users",
    title: "Staff and users",
    description: "Review property staff accounts and access.",
    Icon: Users,
  },
  {
    to: "/settings/subscription",
    title: "Subscription & add-ons",
    description: "Review your package, current entitlements and request commercial changes.",
    Icon: CreditCard,
  },
] as const;

function TenantSettings() {
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Property workspace
          </p>
          <h1 className="text-3xl fon¶»§q«^