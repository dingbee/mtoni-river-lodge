import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

type PricingRecord = Record<string, any>;
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPricingIntelligenceDashboard,
  getPricingDemandForecast,
  generatePricingReviewRecommendations,
  decidePricingRecommendation,
  savePricingScenario,
  listPricingRecommendations,
  listPricingScenarios,
} from "@/domains/pricing-intelligence/pricing-intelligence.functions";
import { listPricingIntelligenceRooms } from "@/domains/pricing-intelligence/pricing-intelligence-catalogue.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/pricing-intelligence")({
  head: () => ({ meta: [{ title: "Pricing Intelligence — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PricingIntelligence,
});

function day(n: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not available";
  return `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "Not available" : `${(value * 100).toFixed(1)}%`;
}

function PricingIntelligence() {
  const queryClient = useQueryClient();
  const dashboardFn = useServerFn(getPricingIntelligenceDashboard);
  const forecastFn = useServerFn(getPricingDemandForecast);
  const scanFn = useServerFn(generatePricingReviewRecommendations);
  const decideFn = useServerFn(decidePricingRecommendation);
  const scenarioFn = useServerFn(savePricingScenario);
  const recommendationsFn = useServerFn(listPricingRecommendations);
  const scenariosFn = useServerFn(listPricingScenarios);
  const roomsFn = useServerFn(listPricingIntelligenceRooms);
  const [from, setFrom] = useState(day(-29));
  const [to, setTo] = useState(day(0));
  const [horizonDays, setHorizonDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [roomId, setRoomId] = useState("");
  const [scenarioName, setScenarioName] = useState("Rate adjustment scenario");
  const [scenarioFrom, setScenarioFrom] = useState(day(7));
  const [scenarioTo, setScenarioTo] = useState(day(8));
  const [adjustment, setAdjustment] = useState("5");

  const dashboard = useQuery({
    queryKey: ["spe08.dashboard", from, to],
    queryFn: () => dashboardFn({ data: { from, to } }),
  });
  const recommendations = useQuery({
    queryKey: ["spe08.recommendations"],
    queryFn: async () => (await recommendationsFn({ data: { limit: 50 } })) as PricingRecord[],
  });
  const scenarios = useQuery({
    queryKey: ["spe08.scenarios"],
    queryFn: async () => (await scenariosFn({ data: { limit: 20 } })) as PricingRecord[],
  });
  const rooms = useQuery({ queryKey: ["spe08.rooms"], queryFn: () => roomsFn() });

  const forecast = useMutation({
    mutationFn: () => forecastFn({ data: { horizonDays } }),
  });
  const scan = useMutation({
    mutationFn: () => scanFn({ data: { horizonDays } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["spe08.recommendations"] }); },
  });
  const decision = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" }) =>
      decideFn({ data: { ...v, reason: v.decision === "approved" ? "Approved for manual rate-plan review; no automatic execution." : "Rejected during property review." } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["spe08.recommendations"] }); },
  });
  const scenario = useMutation({
    mutationFn: () => scenarioFn({
      data: {
        name: scenarioName, roomId, from: scenarioFrom, to: scenarioTo,
        adults: 1, adjustmentPercent: Number(adjustment),
      },
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["spe08.scenarios"] }); },
  });

  const data = dashboard.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing Intelligence"
        description="Evidence-led revenue analysis, occupancy forecasting and controlled pricing decisions."
        actions={<Badge variant="secondary">Rule-based decision support only</Badge>}
      />

      <SectionCard title="Reporting period" description="Historical booked results are separated from forecasts and hypothetical scenarios.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <Button variant="outline" onClick={() => dashboard.refetch()} disabled={dashboard.isFetching}>Refresh analytics</Button>
        </div>
      </SectionCard>

      {dashboard.isLoading ? <LoadingState /> : dashboard.error ? (
        <SectionCard title="Analytics unavailable"><p className="text-sm text-destructive">Property analytics could not be loaded. Confirm finance/revenue entitlement and property access.</p></SectionCard>
      ) : data ? (
        <>
          <SectionCard title="Historical performance" description="Booked accommodation value is calculated from booking-night rates, excluding taxes and fees. It is not accounting-recognized revenue.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Booked room nights" value={data.metrics.bookedRoomNights.toLocaleString()} />
              <StatCard label="Completed room nights" value={data.metrics.completedRoomNights.toLocaleString()} />
              <StatCard label="Booked occupancy" value={percent(data.metrics.bookedOccupancy)} hint="Booked inventory proxy, not physical occupancy" />
              <StatCard label="Average length of stay" value={data.metrics.averageLengthOfStay === null ? "Not available" : data.metrics.averageLengthOfStay.toFixed(1) + " nights"} />
              <StatCard label="Average booking lead time" value={data.metrics.averageBookingLeadDays === null ? "Not available" : data.metrics.averageBookingLeadDays.toFixed(1) + " days"} />
              <StatCard label="Cancellation rate" value={percent(data.metrics.cancellationRate)} />
              <StatCard label="No-show rate" value={percent(data.metrics.noShowRate)} />
              <StatCard label="Currency buckets" value={data.metrics.accommodationByCurrency.length.toLocaleString()} hint="Financial totals remain separated by currency below" />
            </div>
            <div className="mt-4 space-y-3">
              {data.metrics.accommodationByCurrency.map((c) => (
                <div key={c.currency} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between"><strong>{c.currency}</strong><Badge variant="outline">{c.bookingCount} bookings</Badge></div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>Booking value: <strong>{money(c.bookingValue, c.currency)}</strong></div>
                    <div>Booked accommodation: <strong>{money(c.bookedAccommodation, c.currency)}</strong></div>
                    <div>ADR (booked): <strong>{money(c.adr, c.currency)}</strong></div>
                    <div>RevPAR (booked): <strong>{money(c.revpar, c.currency)}</strong></div>
                    <div>Recorded tax amount: <strong>{money(c.taxesRecorded, c.currency)}</strong></div>
                    <div>Tax addition: <strong>{money(c.taxAddition, c.currency)}</strong></div>
                    <div>Extras total: <strong>{money(c.extrasTotal, c.currency)}</strong></div>
                  </div>
                </div>
              ))}
              {!data.metrics.accommodationByCurrency.length && <p className="text-sm text-muted-foreground">No qualifying booking data for this period.</p>}
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Booking channel contribution">
              <div className="space-y-2 text-sm">
                {data.metrics.byChannel.map((c) => (
                  <div key={c.source} className="flex justify-between border-b pb-2"><span>{c.source}</span><span>{c.bookings} bookings · {c.roomNights} room nights</span></div>
                ))}
                {!data.metrics.byChannel.length && <p className="text-muted-foreground">No channel-attributed booking nights.</p>}
              </div>
            </SectionCard>
            <SectionCard title="Revenue by room">
              <div className="space-y-2 text-sm">
                {data.metrics.byRoom.map((r) => (
                  <div key={r.roomId} className="flex justify-between border-b pb-2"><span>{r.roomName}</span><span>{r.roomNights} room nights</span></div>
                ))}
                {!data.metrics.byRoom.length && <p className="text-muted-foreground">No room-level booking-night data.</p>}
              </div>
            </SectionCard>
            <SectionCard title="Revenue by rate plan" description="Rate-plan attribution comes from the immutable booking pricing snapshot.">
              <div className="space-y-3 text-sm">
                {data.metrics.byRatePlan.map((r) => (
                  <div key={r.ratePlanId} className="border-b pb-2">
                    <div className="font-medium">{r.name}{r.code ? ` · ${r.code}` : ""}</div>
                    <div className="text-xs text-muted-foreground">Version {r.version ?? "Not captured"} · Publication {r.publicationNumber ?? "Not captured"} · {r.bookings} bookings · {r.roomNights} room nights</div>
                    {Object.entries(r.accommodationByCurrency ?? {}).map(([currency, amount]) => (
                      <div key={currency}>{currency} accommodation: <strong>{money(Number(amount), currency)}</strong></div>
                    ))}
                  </div>
                ))}
                {!data.metrics.byRatePlan.length && <p className="text-muted-foreground">No rate-plan snapshot attribution is available.</p>}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Data quality and limitations">
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>Active room types: <strong>{data.dataQuality.roomCount}</strong></div>
              <div>Configured room units: <strong>{data.dataQuality.totalUnits}</strong></div>
              <div>Reservations inspected: <strong>{data.dataQuality.reservationRows}</strong></div>
              <div>Booking-night rows: <strong>{data.dataQuality.bookingNightRows}</strong></div>
              <div>Missing nightly rates: <strong>{data.dataQuality.missingNightRates}</strong></div>
              <div>Invalid currency rows: <strong>{data.dataQuality.invalidCurrencies}</strong></div>
              <div>Unattributed channel rows: <strong>{data.dataQuality.unattributedChannelRows}</strong></div>
              <div>Historical pricing snapshots: <strong>{data.dataQuality.historicalSnapshotsAvailable}</strong></div>
              <div>Missing historical snapshots: <strong>{data.dataQuality.missingHistoricalSnapshots}</strong></div>
              <div>Invalid booked occupancy: <strong>{data.dataQuality.invalidBookedOccupancy ? "Yes" : "No"}</strong></div>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {data.limitations.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </SectionCard>
        </>
      ) : null}

      <SectionCard title="Demand and occupancy forecast" description="Expected occupancy is withheld until historical daily-inventory coverage is certified. Confirmed bookings remain visible as committed demand.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Horizon
            <select className="mt-1 block h-10 rounded-md border bg-background px-3" value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value) as 7 | 14 | 30 | 60 | 90)}>
              {[7,14,30,60,90].map((v) => <option key={v} value={v}>{v} days</option>)}
            </select>
          </label>
          <Button onClick={() => forecast.mutate()} disabled={forecast.isPending}>{forecast.isPending ? "Calculating…" : "Generate forecast"}</Button>
          <Button variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>{scan.isPending ? "Scanning…" : "Generate review recommendations"}</Button>
        </div>
        {forecast.data && (
          <div className="mt-4 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={forecast.data.status === "available" ? "secondary" : "destructive"}>{forecast.data.status}</Badge><span className="text-xs text-muted-foreground">Generated {new Date(forecast.data.generatedAt).toLocaleString()}</span></div>
            <div className="mt-2 text-lg font-semibold">Expected occupancy: {percent(forecast.data.expectedOccupancy)}</div>
            <p className="text-xs text-muted-foreground">Confidence proxy: {percent(forecast.data.confidence)} · {forecast.data.dataCoverage.historicalDaysWithStayActivity} historical stay dates · {forecast.data.methodVersion}</p>
            <div className="mt-3 space-y-1 text-sm">
              {forecast.data.daily.map((d) => <div key={d.date} className="flex justify-between border-b py-1"><span>{d.date}</span><span>Booked {percent(d.bookedOccupancy)} · Expected {percent(d.expectedOccupancy)}</span></div>)}
            </div>
            <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">{forecast.data.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {forecast.error && <p className="mt-2 text-sm text-destructive">Forecast failed. No unsupported projection has been substituted.</p>}
        {scan.data && <p className="mt-3 text-sm">Recommendation scan: {scan.data.generated} generated · {scan.data.status}.</p>}
        {scan.error && <p className="mt-2 text-sm text-destructive">Recommendation scan failed.</p>}
      </SectionCard>

      <SectionCard title="Pricing recommendations" description="Recommendations require property review. Approval does not publish a rate or trigger distribution.">
        <div className="space-y-3">
          {(recommendations.data ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{r.recommendation_type.replaceAll("_", " ")}</strong><Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge></div>
              <p className="mt-1 text-sm">{r.window_from} – {r.window_to} · Confidence {percent(r.confidence)}</p>
              <p className="mt-2 text-sm">{r.explanation?.observation}</p>
              <p className="text-sm text-muted-foreground">{r.explanation?.nextStep}</p>
              <p className="mt-1 text-xs text-muted-foreground">Evidence: {r.evidence.length} daily observations · {r.method_version}</p>
              {["generated", "pending_review"].includes(r.status) && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => decision.mutate({ id: r.id, decision: "approved" })} disabled={decision.isPending}>Approve for manual review</Button>
                  <Button size="sm" variant="outline" onClick={() => decision.mutate({ id: r.id, decision: "rejected" })} disabled={decision.isPending}>Reject</Button>
                </div>
              )}
            </div>
          ))}
          {!recommendations.data?.length && <p className="text-sm text-muted-foreground">No recommendations are currently recorded.</p>}
        </div>
      </SectionCard>

      <SectionCard title="Pricing scenario simulation" description="The canonical SPE-04 resolver supplies the baseline. Proposed scenario values are accommodation-only and do not mutate live pricing.">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Scenario name<Input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} /></label>
          <label className="text-sm">Room<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={roomId} onChange={(e) => setRoomId(e.target.value)}><option value="">Select room</option>{(rooms.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.currency}</option>)}</select></label>
          <label className="text-sm">From<Input type="date" value={scenarioFrom} onChange={(e) => setScenarioFrom(e.target.value)} /></label>
          <label className="text-sm">To (checkout)<Input type="date" value={scenarioTo} onChange={(e) => setScenarioTo(e.target.value)} /></label>
          <label className="text-sm">Rate adjustment (%)<Input type="number" min="-50" max="50" step="0.5" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} /></label>
        </div>
        <Button className="mt-3" onClick={() => scenario.mutate()} disabled={!roomId || scenario.isPending}>{scenario.isPending ? "Simulating…" : "Run scenario"}</Button>
        {scenario.data && <div className="mt-3 rounded-lg border p-3 text-sm"><strong>{money(scenario.data.baselineAccommodation, scenario.data.currency)} baseline</strong><p>Proposed: {money(scenario.data.proposedAccommodation, scenario.data.currency)} · Change: {money(scenario.data.delta, scenario.data.currency)}</p><p className="text-xs text-muted-foreground">{scenario.data.limitations.join(" ")}</p></div>}
        {scenario.error && <p className="mt-2 text-sm text-destructive">Scenario could not be resolved. Check the selected published rate plan and date restrictions.</p>}
        <div className="mt-4 space-y-2 text-sm">
          {(scenarios.data ?? []).map((s) => <div key={s.id} className="flex justify-between border-b py-2"><span>{s.name} · {s.window_from} – {s.window_to}</span><span>{money(s.result?.proposedAccommodation, s.currency)}</span></div>)}
        </div>
      </SectionCard>

      <SectionCard title="Market intelligence">
        <div className="flex items-center gap-2"><Badge variant="outline">Framework configured</Badge><Badge variant="secondary">No external source connected</Badge></div>
        <p className="mt-2 text-sm text-muted-foreground">Competitor observations require a lawful source, observation timestamp, currency and comparable room/rate-plan details. No competitor prices or market averages are fabricated or currently displayed.</p>
      </SectionCard>
    </div>
  );
}
