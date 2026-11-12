import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Wallet,
  RefreshCw,
  Percent,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getRevenueDashboard, getRevenueHealth } from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/")({
  head: () => ({
    meta: [
      { title: "Revenue Dashboard â€” StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RevenueDashboard,
});

function money(v: number, currency: string) {
  return `${currency} ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function RevenueDashboard() {
  const dashFn = useServerFn(getRevenueDashboard);
  const healthFn = useServerFn(getRevenueHealth);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().s¶»§q«^