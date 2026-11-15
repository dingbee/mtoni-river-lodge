import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, RefreshCw, Send } from "lucide-react";
import {
  getTenantCommercialSubscriptionWorkspace,
  requestTenantCommercialChange,
} from "@/domains/commercial/subscription-change-request.functions";
type Workspace = Awaited<ReturnType<typeof getTenantCommercialSubscriptionWorkspace>>;

export const Route = createFileRoute("/_authenticated/settings/subscription")({
  head: () => ({
    meta: [
      { title: "Subscription & Add-ons â€” StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: () => getTenantCommercialSubscriptionWorkspace(),
  component: TenantSubscriptionWorkspace,
});

type RequestType = "subscribe" | "add_addon" | "remove_addon" | "upgrade" | "downgrade" | "cancel";

function money(amountMinor: number, currency: "TZS" | "USD") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function TenantSubscriptionWorkspace() {
  const data = Route.useLoaderData() as Workspace;
  const requestFn = useServerFn(requestTenantCommercialChange);
  const [requestType, setRequestType] = useState<RequestType>("add_addon");
  const [planCode, setPlanCode] = useState<"essential" | "professional" | "enterprise">(
    "essential",
  );
  const [planVersion, setPlanVersion] = useState(1);
  c¶»§q«^