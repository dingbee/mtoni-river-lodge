import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Save, Trash2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listCampaigns, saveCampaign, deleteCampaign, type CampaignInput } from "@/domains/marketing/campaigns/campaigns.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Campaigns,
});

const STATUSES = ["draft", "scheduled", "running", "paused", "completed", "archived"] as const;

const EMPTY: CampaignInput = {
  name: "", status: "draft", currency: "USD",
  utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "",
};

function buildUtmUrl(landing: string, f: CampaignInput): string {
  if (!landing) return "";
  try {
    const base = landing.startsWith("http") ? landing : `https://mtoniriverlodge.com${landing.startsWith("/") ? "" : "/"}${landing}`;
    const url = new URL(base);
    const set = (k: string, v?: string | null) => v && url.searchParams.set(k, v);
    set("utm_source", f.utm_source);
    set("utm_medium", f.utm_medium);
    set("utm_campaign", f.utm_campaign);
    set("utm_term", f.utm_term);
    set("utm_content", f.utm_content);
    return url.toString();
  } catch { return landing; }
}

function Campaigns() {
  const listFn = useServerFn(listCampaigns);
  const saveFn = useServerFn(saveCampaign);
  const delFn = useServerFn(deleteCampaign);
  const qc = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["admin.campaigns"],
    queryFn: () => listFn(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignInput>(EMPTY);

  const selectCampaign = (id: string | null) => {
    setSelectedId(id);
    if (!id) { setForm(EMPTY); return; }
    const row = (campaigns ?? []).find((c) => c.id === id);
    if (row) setForm({ ...(row as unknown as CampaignInput), id: row.id });
  };

  const save = useMutation({
    mutationFn: (payload: CampaignInput) => saveFn({ data: payload }),
    onSuccess: (row) => {
      toast.success("Campaign saved");
      qc.invalidateQueries({ queryKey: ["admin.campaigns"] });
      if (row?.id) setSelectedId(row.id);
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Campaign removed");
      qc.invalidateQueries({ queryKey: ["admin.campaigns"] });
      selectCampaign(null);
    },
  });

  const update = <K extends keyof CampaignInput>(k: K, v: CampaignInput[K]) => setForm((p) => ({ ...p, [k]: v }));
  const utmUrl = useMemo(() => buildUtmUrl(form.landing_page ?? "", form), [form]);

  const totalBudget = (campaigns ?? []).reduce((s, c) => s + Number(c.budget ?? 0), 0);
  const runningCount = (campaigns ?? []).filter((c) => c.status === "running" || c.status === "scheduled").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Campaigns" description="Create, schedule and track marketing campaigns with UTM links and budgets." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total campaigns" value={String(campaigns?.length ?? 0)} />
        <StatCard label="Active / scheduled" value={String(runningCount)} />
        <StatCard label="Total budget" value={`$${totalBudget.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <SectionCard
          title="Campaigns"
          actions={<Button size="sm" variant="outline" onClick={() => selectCampaign(null)}><Plus className="h-4 w-4 mr-1" />New</Button>}
        >
          {isLoading ? <LoadingState /> : (
            <ul className="space-y-1">
              {(campaigns ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => selectCampaign(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedId === c.id ? "bg-accent" : "hover:bg-accent/50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      <Badge variant="secondary" className="capitalize">{c.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.start_date ?? "—"} → {c.end_date ?? "—"}
                    </div>
                  </button>
                </li>
              ))}
              {!campaigns?.length && <li className="text-sm text-muted-foreground px-3 py-2">No campaigns yet.</li>}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={selectedId ? `Editing "${form.name || "campaign"}"` : "New campaign"}
          actions={
            <div className="flex items-center gap-2">
              {selectedId && (
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(selectedId)} disabled={remove.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" onClick={() => save.mutate(form)} disabled={!form.name || save.isPending}>
                <Save className="h-4 w-4 mr-1" />Save
              </Button>
            </div>
          }
        >
          <Tabs defaultValue="details">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="landing">Landing &amp; UTM</TabsTrigger>
              <TabsTrigger value="budget">Budget</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3 pt-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></div>
              <div><Label>Objective</Label><Input value={form.objective ?? ""} onChange={(e) => update("objective", e.target.value)} placeholder="Drive off-season bookings" /></div>
              <div><Label>Audience</Label><Input value={form.audience ?? ""} onChange={(e) => update("audience", e.target.value)} placeholder="Returning guests, EU market" /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status ?? "draft"} onValueChange={(v) => update("status", v as CampaignInput["status"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} /></div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start date</Label><Input type="date" value={form.start_date ?? ""} onChange={(e) => update("start_date", e.target.value)} /></div>
                <div><Label>End date</Label><Input type="date" value={form.end_date ?? ""} onChange={(e) => update("end_date", e.target.value)} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Scheduled campaigns move to "running" automatically on the start date via the Content Calendar.</p>
            </TabsContent>

            <TabsContent value="landing" className="space-y-3 pt-4">
              <div><Label>Landing page URL or path</Label><Input value={form.landing_page ?? ""} onChange={(e) => update("landing_page", e.target.value)} placeholder="/experiences/river-safari" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>utm_source</Label><Input value={form.utm_source ?? ""} onChange={(e) => update("utm_source", e.target.value)} placeholder="newsletter" /></div>
                <div><Label>utm_medium</Label><Input value={form.utm_medium ?? ""} onChange={(e) => update("utm_medium", e.target.value)} placeholder="email" /></div>
                <div><Label>utm_campaign</Label><Input value={form.utm_campaign ?? ""} onChange={(e) => update("utm_campaign", e.target.value)} placeholder="autumn-2026" /></div>
                <div><Label>utm_term</Label><Input value={form.utm_term ?? ""} onChange={(e) => update("utm_term", e.target.value)} /></div>
                <div className="md:col-span-2"><Label>utm_content</Label><Input value={form.utm_content ?? ""} onChange={(e) => update("utm_content", e.target.value)} /></div>
              </div>
              <div className="rounded-md border bg-muted p-3 text-sm break-all">
                <div className="text-xs text-muted-foreground mb-1">Generated URL</div>
                {utmUrl ? (
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs">{utmUrl}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(utmUrl); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
                      <a href={utmUrl} target="_blank" rel="noreferrer" className="inline-flex"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button></a>
                    </div>
                  </div>
                ) : <span className="text-muted-foreground text-xs">Add a landing page to preview the UTM URL.</span>}
              </div>
            </TabsContent>

            <TabsContent value="budget" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Budget</Label><Input type="number" step="0.01" value={form.budget ?? ""} onChange={(e) => update("budget", e.target.value ? Number(e.target.value) : null)} /></div>
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency ?? "USD"} onValueChange={(v) => update("currency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["USD", "EUR", "TZS", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Track spend against this budget in the Analytics module (Sprint 6+).</p>
            </TabsContent>
          </Tabs>
        </SectionCard>
      </div>
    </div>
  );
}
