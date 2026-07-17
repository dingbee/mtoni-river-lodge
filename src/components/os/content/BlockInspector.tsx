import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BLOCK_REGISTRY, type CmsBlockKind } from "@/domains/content/pages/blocks";
import type { BlockDraft } from "./types";

interface Props {
  block: BlockDraft | null;
  onChange: (patch: Record<string, unknown>) => void;
}

export function BlockInspector({ block, onChange }: Props) {
  if (!block) {
    return (
      <aside className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        Select a block to edit its properties.
      </aside>
    );
  }
  const meta = BLOCK_REGISTRY[block.kind];
  const data = block.data;
  const str = (k: string) => (data[k] as string) ?? "";
  const set = (k: string, v: unknown) => onChange({ [k]: v });

  return (
    <aside className="rounded-lg border border-border bg-card p-4 space-y-3">
      <header>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{meta.label} properties</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>
      </header>

      {block.kind === "hero" && (
        <>
          <Field label="Eyebrow"><Input value={str("eyebrow")} onChange={(e) => set("eyebrow", e.target.value)} /></Field>
          <Field label="Heading"><Input value={str("heading")} onChange={(e) => set("heading", e.target.value)} /></Field>
          <Field label="Subheading"><Textarea rows={2} value={str("subheading")} onChange={(e) => set("subheading", e.target.value)} /></Field>
          <Field label="Image URL"><Input value={str("image")} onChange={(e) => set("image", e.target.value)} /></Field>
          <Field label="CTA label"><Input value={str("ctaLabel")} onChange={(e) => set("ctaLabel", e.target.value)} /></Field>
          <Field label="CTA URL"><Input value={str("ctaHref")} onChange={(e) => set("ctaHref", e.target.value)} /></Field>
        </>
      )}

      {block.kind === "rich_text" && (
        <Field label="HTML"><Textarea rows={8} value={str("html")} onChange={(e) => set("html", e.target.value)} /></Field>
      )}

      {block.kind === "image_gallery" && (
        <ListEditor
          label="Images"
          items={(data.images as Array<{ src: string; alt?: string }>) ?? []}
          empty={{ src: "", alt: "" }}
          onChange={(items) => set("images", items)}
          render={(item, update) => (
            <>
              <Input placeholder="Image URL" value={item.src} onChange={(e) => update({ ...item, src: e.target.value })} />
              <Input placeholder="Alt text" value={item.alt ?? ""} onChange={(e) => update({ ...item, alt: e.target.value })} />
            </>
          )}
        />
      )}

      {block.kind === "cta" && (
        <>
          <Field label="Heading"><Input value={str("heading")} onChange={(e) => set("heading", e.target.value)} /></Field>
          <Field label="Body"><Textarea rows={2} value={str("body")} onChange={(e) => set("body", e.target.value)} /></Field>
          <Field label="Button label"><Input value={str("label")} onChange={(e) => set("label", e.target.value)} /></Field>
          <Field label="Button URL"><Input value={str("url")} onChange={(e) => set("url", e.target.value)} /></Field>
        </>
      )}

      {block.kind === "faq" && (
        <>
          <Field label="Heading"><Input value={str("heading")} onChange={(e) => set("heading", e.target.value)} /></Field>
          <ListEditor
            label="Questions"
            items={(data.items as Array<{ q: string; a: string }>) ?? []}
            empty={{ q: "", a: "" }}
            onChange={(items) => set("items", items)}
            render={(item, update) => (
              <>
                <Input placeholder="Question" value={item.q} onChange={(e) => update({ ...item, q: e.target.value })} />
                <Textarea rows={2} placeholder="Answer" value={item.a} onChange={(e) => update({ ...item, a: e.target.value })} />
              </>
            )}
          />
        </>
      )}

      {block.kind === "video" && (
        <>
          <Field label="Video URL"><Input value={str("url")} onChange={(e) => set("url", e.target.value)} /></Field>
          <Field label="Caption"><Input value={str("caption")} onChange={(e) => set("caption", e.target.value)} /></Field>
        </>
      )}

      {block.kind === "reviews" && (
        <>
          <Field label="Heading"><Input value={str("heading")} onChange={(e) => set("heading", e.target.value)} /></Field>
          <Field label="Limit">
            <Input type="number" min={1} max={24} value={Number(data.limit ?? 6)} onChange={(e) => set("limit", Number(e.target.value))} />
          </Field>
        </>
      )}

      {block.kind === "statistics" && (
        <>
          <Field label="Heading"><Input value={str("heading")} onChange={(e) => set("heading", e.target.value)} /></Field>
          <ListEditor
            label="Stats"
            items={(data.items as Array<{ value: string; label: string }>) ?? []}
            empty={{ value: "", label: "" }}
            onChange={(items) => set("items", items)}
            render={(item, update) => (
              <>
                <Input placeholder="Value (e.g. 4.9★)" value={item.value} onChange={(e) => update({ ...item, value: e.target.value })} />
                <Input placeholder="Label" value={item.label} onChange={(e) => update({ ...item, label: e.target.value })} />
              </>
            )}
          />
        </>
      )}

      {block.kind === "contact" && (
        <>
          <Field label="Heading"><Input value={str("heading")} onChange={(e) => set("heading", e.target.value)} /></Field>
          <Field label="Email"><Input value={str("email")} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone"><Input value={str("phone")} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Address"><Textarea rows={2} value={str("address")} onChange={(e) => set("address", e.target.value)} /></Field>
        </>
      )}

      {block.kind === "map" && (
        <>
          <Field label="Embed URL"><Input value={str("url")} onChange={(e) => set("url", e.target.value)} /></Field>
          <Field label="Caption"><Input value={str("caption")} onChange={(e) => set("caption", e.target.value)} /></Field>
        </>
      )}

      {block.kind === "rooms" && (
        <>
          <Field label="Heading"><Input value={str("heading")} onChange={(e) => set("heading", e.target.value)} /></Field>
          <Field label="Limit">
            <Input type="number" min={1} max={24} value={Number(data.limit ?? 6)} onChange={(e) => set("limit", Number(e.target.value))} />
          </Field>
        </>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ListEditor<T extends Record<string, unknown>>({
  label,
  items,
  empty,
  onChange,
  render,
}: {
  label: string;
  items: T[];
  empty: T;
  onChange: (items: T[]) => void;
  render: (item: T, update: (v: T) => void) => React.ReactNode;
}) {
  const update = (i: number, v: T) => onChange(items.map((it, idx) => (idx === i ? v : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { ...empty }]);
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {items.map((item, i) => (
        <div key={i} className="space-y-1 rounded-md border border-border bg-background/60 p-2">
          {render(item, (v) => update(i, v))}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => remove(i)}>
            <Trash2 className="mr-1 h-3 w-3" /> Remove
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="w-full">
        <Plus className="mr-1 h-3 w-3" /> Add
      </Button>
    </div>
  );
}