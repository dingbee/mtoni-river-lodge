import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  decideFounderSubscriptionChangeRequest,
  listFounderSubscriptionChangeRequests,
  type FounderSubscriptionChangeRequest,
} from "@/domains/commercial/subscription-change-request.functions";

export const Route = createFileRoute("/_authenticated/founder/subscription-requests")({
  head: () => ({
    meta: [
      { title: "Subscription Requests â€” StayNas Founder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } =
      await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: () => listFounderSubscriptionChangeRequests(),
  component: FounderSubscriptionRequests,
});

function FounderSubscriptionRequests() {
  const requests = Route.useLoaderData() as FounderSubscriptionChangeRequest[];
  const decideFn = useServerFn(decideFounderSubscriptionChangeRequest);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(requestId: string, decision: "approved" | "declined") {
    const reason = reasonById[requestId]?.tr¶»§q«^