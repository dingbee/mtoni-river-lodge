import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, Plus, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { LoadingState } from "@/components/os/LoadingState";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  listSeoOverrides,
  upsertSeoOverride,
  deleteSeoOverride,
  type SeoOverrideInput,
} from "@/domains/marketing/seo/seo.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/seo")({
  head: () => ({ meta: [{ title: "SEO Centre — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: SeoCentre,
});

const SCHEMA_OPTIONS = [
  "WebSite", "WebPage", "Organization", "LocalBusiness", "LodgingBusiness",
  "Article", "BlogPosting", "Product", "FAQPage", "BreadcrumbList", "Event",
] as const;

const ROBOTS_OPTIONS = ["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"];
const TWITTER_CARDS = ["summary", "summary_large_image", "app", "player"];

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

type FormState = SeoOverrideInput;

const EMPTY_FORM: FormState = {
  route_path: "",
  title: "",
  description: "",
  keywords: [],
  canonical_url: "",
  og_title: "",
  og_description: "",
  og_image: "",
  twitter_card: "summary_large_image",
  twitter_title: "",
  twitter_description: "",
  twitter_image: "",
  robots: "index,follow",
  index_status: true,
  schema_type: "WebPage",
  notes: "",
};

interface ScoreResult {
  score: number;
  issues: { level: "error" | "warn" | "ok"; message: string }[];
}

function scoreSeo(f: FormState): ScoreResult {
  const issues: ScoreResult["issues"] = [];
  let score = 100;
  const t = (f.title ?? "").trim();
  const d = (f.description ?? "").trim();
  if (!t) { issues.push({ level: "error", message: "Missing SEO title" }); score -= 25; }
  else if (t.length < TITLE_MIN) { issues.push({ level: "warn", message: `Title is short (${t.length}/${TITLE_MIN}–${TITLE_MAX})` }); score -= 10; }
  else if (t.length > TITLE_MAX) { issues.push({ level: "warn", message: `Title over ${TITLE_MAX} chars — may truncate` }); score -= 8; }
  if (!d) { issues.push({ level: "error", message: "Missing meta description" }); score -= 20; }
  else if (d.length < DESC_MIN) { issues.push({ level: "warn", message: `Description short (${d.length}/${DESC_MIN}–${DESC_MAX})` }); score -= 8; }
  else if (d.length > DESC_MAX) { issues.push({ level: "warn", message: `Description over ${DESC_MAX} — may truncate` }); score -= 6; }
  if (!f.canonical_url) { issues.push({ level: "warn", message: "No canonical URL" }); score -= 8; }
  if (!f.og_title || !f.og_description) { issues.push({ level: "warn", message: "Open Graph title/description incomplete" }); score -= 8; }
  if (!f.og_image) { issues.push({ level: "warn", message: "No Open Graph image" }); score -= 6; }
  if (!f.twitter_card) { issues.push({ level: "warn", message: "No Twitter card type" }); score -= 4; }
  if (!(f.keywords && f.keywords.length)) { issues.push({ level: "warn", message: "No keywords defined" }); score -= 4; }
  if (!f.schema_type) { issues.push({ level: "warn", message: "No schema type selected" }); score -= 5; }
  if (!f.index_status) { issues.push({ level: "warn", message: "Page is set to no-index" }); }
  if (!issues.length) issues.push({ level: "ok", message: "All key fields present" });
  return { score: Math.max(0, score), issues };
}

function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-600";
  if (score >= 65) return "text-amber-600";
  return "text-destructive";
}

function Counter({ value, min, max }: { value: string; min: number; max: number }) {
  const len = value.length;
  const tone = len === 0 ? "text-muted-foreground" : len < min || len > max ? "text-amber-600" : "text-emerald-600";
  return <span className={`text-xs ${tone}`}>{len} chars · target {min}–{max}</span>;
}

function SeoCentre() {
  const listFn = useServerFn(listSeoOverrides);
  const saveFn = useServerFn(upsertSeoOverride);
  const delFn = useServerFn(deleteSeoOverride);
  const qc = useQueryClient();

  const { data: overrides, isLoading } = useQuery({
    queryKey: ["admin.seo.overrides"],
    queryFn: () => listFn(),
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [keywordsText, setKeywordsText] = useState("");

  useEffect(() => {
    if (!overrides?.length || selected) return;
    setSelected(overrides[0].route_path);
  }, [overrides, selected]);

  useEffect(() => {
    if (!selected || !overrides) return;
    const row = overrides.find((o) => o.route_path === selected);
    if (!row) return;
    setForm({
      route_path: row.route_path,
      title: row.title ?? "",
      description: row.description ?? "",
      keywords: row.keywords ?? [],
      canonical_url: row.canonical_url ?? "",
      og_title: row.og_title ?? "",
      og_description: row.og_description ?? "",
      og_image: row.og_image ?? "",
      twitter_card: row.twitter_card ?? "summary_large_image",
      twitter_title: row.twitter_title ?? "",
      twitter_description: row.twitter_description ?? "",
      twitter_image: row.twitter_image ?? "",
      robots: row.robots ?? "index,follow",
      index_status: row.index_status,
      schema_type: row.schema_type ?? "WebPage",
      notes: row.notes ?? "",
    });
    setKeywordsText((row.keywords ?? []).join(", "));
  }, [selected, overrides]);

  const save = useMutation({
    mutationFn: (payload: FormState) => saveFn({ data: payload }),
    onSuccess: (row) => {
      toast.success("SEO settings saved");
      qc.invalidateQueries({ queryKey: ["admin.seo.overrides"] });
      setSelected(row.route_path);
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (routePath: string) => delFn({ data: { routePath } }),
    onSuccess: () => {
      toast.success("Override removed");
      qc.invalidateQueries({ queryKey: ["admin.seo.overrides"] });
      setSelected(null);
      setForm(EMPTY_FORM);
      setKeywordsText("");
    },
  });

  const scoreResult = useMemo(() => scoreSeo(form), [form]);
  const missingCount = useMemo(
    () => (overrides ?? []).filter((o) => !o.title || !o.description).length,
    [overrides],
  );
  const avgScore = useMemo(() => {
    if (!overrides?.length) return 0;
    const total = overrides.reduce((sum, o) => sum + scoreSeo({
      route_path: o.route_path,
      title: o.title,
      description: o.description,
      keywords: o.keywords ?? [],
      canonical_url: o.canonical_url,
      og_title: o.og_title,
      og_description: o.og_description,
      og_image: o.og_image,
      twitter_card: o.twitter_card,
      twitter_title: o.twitter_title,
      twitter_description: o.twitter_description,
      twitter_image: o.twitter_image,
      robots: o.robots,
      index_status: o.index_status,
      schema_type: o.schema_type,
    }).score, 0);
    return Math.round(total / overrides.length);
  }, [overrides]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleKeywords = (text: string) => {
    setKeywordsText(text);
    update("keywords", text.split(",").map((k) => k.trim()).filter(Boolean));
  };

  const handleNew = () => {
    setSelected(null);
    setForm({ ...EMPTY_FORM, route_path: "" });
    setKeywordsText("");
  };

  const canonicalPreview = form.canonical_url || `https://mtoniriverlodge.com${form.route_path || ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO Centre"
        description="Manage metadata overrides for every route. Fallback resolver leaves published pages untouched until you save an override."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Overrides" value={String(overrides?.length ?? 0)} />
        <StatCard label="Average SEO score" value={`${avgScore}`} />
        <StatCard label="Routes missing core metadata" value={String(missingCount)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <SectionCard title="Routes" actions={<Button size="sm" variant="outline" onClick={handleNew}><Plus className="h-4 w-4 mr-1" />New</Button>}>
          {isLoading ? (
            <LoadingState />
          ) : (
            <ul className="space-y-1">
              {(overrides ?? []).map((o) => {
                const isSel = o.route_path === selected;
                const missing = !o.title || !o.description;
                return (
                  <li key={o.id}>
                    <button
                      onClick={() => setSelected(o.route_path)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${isSel ? "bg-accent" : "hover:bg-accent/50"}`}
                    >
                      <span className="truncate font-mono">{o.route_path}</span>
                      {missing && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                    </button>
                  </li>
                );
              })}
              {!overrides?.length && <li className="text-sm text-muted-foreground px-3 py-2">No overrides yet.</li>}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title={selected ? `Editing ${selected}` : "New route override"}
            actions={
              <div className="flex items-center gap-2">
                <div className={`text-sm font-semibold ${scoreTone(scoreResult.score)}`}>Score {scoreResult.score}</div>
                {selected && (
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(selected)} disabled={remove.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" onClick={() => save.mutate(form)} disabled={!form.route_path || save.isPending}>
                  <Save className="h-4 w-4 mr-1" />Save
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <Label>Route path</Label>
                <Input
                  value={form.route_path}
                  onChange={(e) => update("route_path", e.target.value)}
                  placeholder="/experiences/river-safari"
                  disabled={!!selected}
                />
                <p className="text-xs text-muted-foreground mt-1">Applied by the SEO resolver on top of the route's static head() defaults.</p>
              </div>

              <Tabs defaultValue="basics">
                <TabsList className="flex flex-wrap">
                  <TabsTrigger value="basics">Basics</TabsTrigger>
                  <TabsTrigger value="social">Social</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="basics" className="space-y-4 pt-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>SEO title</Label>
                      <Counter value={form.title ?? ""} min={TITLE_MIN} max={TITLE_MAX} />
                    </div>
                    <Input value={form.title ?? ""} onChange={(e) => update("title", e.target.value)} placeholder="Page title shown in search results" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Meta description</Label>
                      <Counter value={form.description ?? ""} min={DESC_MIN} max={DESC_MAX} />
                    </div>
                    <Textarea value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} rows={3} />
                  </div>
                  <div>
                    <Label>Keywords (comma separated)</Label>
                    <Input value={keywordsText} onChange={(e) => handleKeywords(e.target.value)} placeholder="river lodge, tanzania safari, boutique" />
                    {form.keywords && form.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {form.keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Canonical URL</Label>
                    <Input value={form.canonical_url ?? ""} onChange={(e) => update("canonical_url", e.target.value)} placeholder="https://mtoniriverlodge.com/..." />
                  </div>
                </TabsContent>

                <TabsContent value="social" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>OG title</Label>
                      <Input value={form.og_title ?? ""} onChange={(e) => update("og_title", e.target.value)} />
                    </div>
                    <div>
                      <Label>OG image URL</Label>
                      <Input value={form.og_image ?? ""} onChange={(e) => update("og_image", e.target.value)} placeholder="https://.../cover.jpg" />
                    </div>
                  </div>
                  <div>
                    <Label>OG description</Label>
                    <Textarea value={form.og_description ?? ""} onChange={(e) => update("og_description", e.target.value)} rows={2} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Twitter card</Label>
                      <Select value={form.twitter_card ?? ""} onValueChange={(v) => update("twitter_card", v)}>
                        <SelectTrigger><SelectValue placeholder="Select card type" /></SelectTrigger>
                        <SelectContent>
                          {TWITTER_CARDS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Twitter image URL</Label>
                      <Input value={form.twitter_image ?? ""} onChange={(e) => update("twitter_image", e.target.value)} />
                    </div>
                    <div>
                      <Label>Twitter title</Label>
                      <Input value={form.twitter_title ?? ""} onChange={(e) => update("twitter_title", e.target.value)} />
                    </div>
                    <div>
                      <Label>Twitter description</Label>
                      <Input value={form.twitter_description ?? ""} onChange={(e) => update("twitter_description", e.target.value)} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Robots</Label>
                      <Select value={form.robots ?? ""} onValueChange={(v) => update("robots", v)}>
                        <SelectTrigger><SelectValue placeholder="Select robots directive" /></SelectTrigger>
                        <SelectContent>
                          {ROBOTS_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Schema type</Label>
                      <Select value={form.schema_type ?? ""} onValueChange={(v) => update("schema_type", v)}>
                        <SelectTrigger><SelectValue placeholder="Select schema" /></SelectTrigger>
                        <SelectContent>
                          {SCHEMA_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>Allow indexing</Label>
                      <p className="text-xs text-muted-foreground">Turning this off does not push changes to live pages until the resolver is wired in Phase 5.</p>
                    </div>
                    <Switch checked={!!form.index_status} onCheckedChange={(v) => update("index_status", v)} />
                  </div>
                  <div>
                    <Label>Internal notes</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2} />
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="space-y-4 pt-4">
                  <div className="rounded-md border p-4 bg-background">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Search className="h-3 w-3" />Google</div>
                    <div className="text-[#1a0dab] text-lg leading-snug line-clamp-1">{form.title || "Untitled page"}</div>
                    <div className="text-emerald-700 text-xs">{canonicalPreview}</div>
                    <div className="text-sm text-muted-foreground line-clamp-2 mt-1">{form.description || "No meta description set."}</div>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <div className="aspect-[1.91/1] bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      {form.og_image ? <img src={form.og_image} alt="OG preview" className="w-full h-full object-cover" /> : "No OG image set"}
                    </div>
                    <div className="p-3">
                      <div className="text-xs text-muted-foreground uppercase">{new URL(canonicalPreview, "https://mtoniriverlodge.com").host}</div>
                      <div className="font-medium line-clamp-1">{form.og_title || form.title || "Untitled"}</div>
                      <div className="text-sm text-muted-foreground line-clamp-2">{form.og_description || form.description || ""}</div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </SectionCard>

          <SectionCard title="Checks">
            <ul className="space-y-1.5 text-sm">
              {scoreResult.issues.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  {i.level === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />}
                  {i.level === "warn" && <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />}
                  {i.level === "error" && <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />}
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
