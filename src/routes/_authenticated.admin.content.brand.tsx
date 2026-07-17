import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listBrandTokens, saveBrandToken, deleteBrandToken, type BrandTokenInput } from "@/domains/content/brand/brand.functions";

export const Route = createFileRoute("/_authenticated/admin/content/brand")({
  head: () => ({ meta: [{ title: "Brand Centre — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: BrandCentre,
});

const CATEGORIES = ["logo", "color", "font", "voice", "guideline"] as const;
type Category = typeof CATEGORIES[number];

const EMPTY: BrandTokenInput = { key: "", category: "color", label: "", value: {}, notes: "" };

type Token = Awaited<ReturnType<typeof listBrandTokens>>[number];

function BrandCentre() {
  const listFn = useServerFn(listBrandTokens);
  const saveFn = useServerFn(saveBrandToken);
  const delFn = useServerFn(deleteBrandToken);
  const qc = useQueryClient();

  const { data: tokens, isLoading } = useQuery({ queryKey: ["admin.brand"], queryFn: () => listFn() });

  const [tab, setTab] = useState<Category>("color");
  const [form, setForm] = useState<BrandTokenInput>(EMPTY);
  const [valueText, setValueText] = useState("");

  const save = useMutation({
    mutationFn: (payload: BrandTokenInput) => saveFn({ data: payload }),
    onSuccess: () => { toast.success("Brand token saved"); qc.invalidateQueries({ queryKey: ["admin.brand"] }); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Token removed"); qc.invalidateQueries({ queryKey: ["admin.brand"] }); setForm(EMPTY); setValueText(""); },
  });

  const grouped = useMemo(() => {
    const g: Record<string, Token[]> = {};
    for (const t of tokens ?? []) (g[t.category] ??= []).push(t);
    return g;
  }, [tokens]);

  const edit = (t: Token) => {
    setTab(t.category as Category);
    setForm({ id: t.id, key: t.key, category: t.category, label: t.label, value: t.value, notes: t.notes ?? "" });
    setValueText(typeof t.value === "string" ? t.value : JSON.stringify(t.value, null, 2));
  };
  const startNew = (cat: Category) => {
    setTab(cat);
    setForm({ ...EMPTY, category: cat, value: cat === "color" ? "#000000" : cat === "font" ? "Playfair Display" : "" });
    setValueText(cat === "color" ? "#000000" : cat === "font" ? "Playfair Display" : "");
  };

  const submit = () => {
    let value: unknown = valueText;
    if (form.category !== "color" && form.category !== "font") {
      // try JSON, fall back to raw string
      try { value = JSON.parse(valueText); } catch { value = valueText; }
    }
    save.mutate({ ...form, value });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Brand Centre" description="Logos, colours, fonts, tone of voice and brand guidelines — the single source of truth for the Mtoni brand." />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Category)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="logo">Logos</TabsTrigger>
          <TabsTrigger value="color">Colours</TabsTrigger>
          <TabsTrigger value="font">Fonts</TabsTrigger>
          <TabsTrigger value="voice">Tone of voice</TabsTrigger>
          <TabsTrigger value="guideline">Guidelines</TabsTrigger>
        </TabsList>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat} value={cat} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              <SectionCard
                title={`${cat.charAt(0).toUpperCase() + cat.slice(1)} tokens`}
                actions={<Button size="sm" variant="outline" onClick={() => startNew(cat)}><Plus className="h-4 w-4 mr-1" />New</Button>}
              >
                {isLoading ? <LoadingState /> : (
                  <ul className="space-y-2">
                    {(grouped[cat] ?? []).map((t) => <TokenRow key={t.id} token={t} onEdit={edit} />)}
                    {!(grouped[cat] ?? []).length && <li className="text-sm text-muted-foreground">No {cat} tokens yet.</li>}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title={form.id ? "Edit token" : "New token"}
                actions={
                  <div className="flex items-center gap-1">
                    {form.id && <Button size="sm" variant="ghost" onClick={() => remove.mutate(form.id!)}><Trash2 className="h-4 w-4" /></Button>}
                    <Button size="sm" onClick={submit} disabled={!form.key || !form.label || save.isPending}><Save className="h-4 w-4 mr-1" />Save</Button>
                  </div>
                }
              >
                <div className="space-y-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Key</Label><Input value={form.key} onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))} placeholder="color.primary" /></div>
                  <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="Primary brand green" /></div>
                  <div>
                    <Label>Value</Label>
                    {form.category === "color" ? (
                      <div className="flex items-center gap-2">
                        <Input type="color" value={valueText || "#000000"} onChange={(e) => setValueText(e.target.value)} className="w-16 h-9 p-1" />
                        <Input value={valueText} onChange={(e) => setValueText(e.target.value)} placeholder="#0d3b2e" />
                      </div>
                    ) : form.category === "font" ? (
                      <Input value={valueText} onChange={(e) => setValueText(e.target.value)} placeholder="Playfair Display / Inter" />
                    ) : (
                      <Textarea rows={6} value={valueText} onChange={(e) => setValueText(e.target.value)} placeholder={form.category === "logo" ? "https://.../logo.svg" : "Free text or JSON"} />
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {form.category === "logo" && "Paste a hosted logo URL (SVG/PNG)."}
                      {form.category === "voice" && "Describe the brand voice — pacing, sensory cues, forbidden words."}
                      {form.category === "guideline" && "Free-form or JSON — guideline snippets used by AI assistant and content authors."}
                    </p>
                  </div>
                  <div><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
                </div>
              </SectionCard>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TokenRow({ token, onEdit }: { token: Token; onEdit: (t: Token) => void }) {
  const val = token.value as unknown;
  const isColor = token.category === "color" && typeof val === "string" && val.startsWith("#");
  const isLogo = token.category === "logo" && typeof val === "string" && val.startsWith("http");
  return (
    <li>
      <button
        onClick={() => onEdit(token)}
        className="w-full text-left rounded-md border p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors"
      >
        {isColor && <span className="h-8 w-8 rounded border" style={{ background: val as string }} />}
        {isLogo && <img src={val as string} alt={token.label} className="h-8 w-8 object-contain" />}
        {!isColor && !isLogo && <span className="h-8 w-8 rounded bg-muted inline-flex items-center justify-center text-xs uppercase text-muted-foreground">{token.category[0]}</span>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium truncate">{token.label}</span>
            <span className="text-xs font-mono text-muted-foreground">{token.key}</span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {typeof val === "string" ? val : JSON.stringify(val)}
          </div>
        </div>
      </button>
    </li>
  );
}