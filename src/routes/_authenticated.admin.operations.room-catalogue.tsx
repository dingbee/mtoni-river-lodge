import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listPlatformRoomCatalogue, savePlatformRoomCatalogueCategory, savePlatformRoomCatalogueType,
} from "@/lib/room-management.functions";

export const Route = createFileRoute("/_authenticated/admin/operations/room-catalogue")({
  head: () => ({ meta: [{ title: "Platform System Configuration — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PlatformRoomCataloguePage,
});

const blankCategory = () => ({ id: undefined as string | undefined, slug: "", name: "", description: "", features: "", specifications: "", sortOrder: 0, status: "active" as "active" | "archived" });
const blankType = () => ({
  id: undefined as string | undefined, slug: "", name: "", shortName: "", roomNumberLabel: "", catalogueCategoryId: "none", shortDescription: "", capacityAdults: 2,
  capacityChildren: 0, maxOccupancy: 2, description: "", details: "", ctaLine: "", heroLine: "", imageUrl: "", galleryUrls: "",
  sizeLabel: "", viewLabel: "", bedLabel: "", bathroomLabel: "", sortOrder: 0, status: "active" as "active" | "inactive",
});
const toLines = (value: Record<string, string> | null | undefined) => Object.entries(value ?? {}).map(([k, v]) => k + ": " + v).join("\n");
const toSpecs = (value: string) => Object.fromEntries(value.split("\n").map(v => v.trim()).filter(Boolean).map(line => {
  const i = line.indexOf(":"); return i > 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : [line, ""];
}));

function PlatformRoomCataloguePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlatformRoomCatalogue);
  const saveCategoryFn = useServerFn(savePlatformRoomCatalogueCategory);
  const saveTypeFn = useServerFn(savePlatformRoomCatalogueType);
  const q = useQuery({ queryKey: ["platform-room-catalogue"], queryFn: () => listFn() });
  const [category, setCategory] = useState(blankCategory());
  const [roomType, setRoomType] = useState(blankType());

  const categoryMutation = useMutation({
    mutationFn: () => saveCategoryFn({ data: {
      id: category.id, slug: category.slug, name: category.name, description: category.description,
      features: category.features.split("\n").map(v => v.trim()).filter(Boolean),
      specifications: toSpecs(category.specifications), sortOrder: Number(category.sortOrder), status: category.status,
    }}),
    onSuccess: () => { toast.success("Platform category saved"); setCategory(blankCategory()); qc.invalidateQueries({ queryKey: ["platform-room-catalogue"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const typeMutation = useMutation({
    mutationFn: () => saveTypeFn({ data: {
      id: roomType.id, slug: roomType.slug, name: roomType.name, shortName: roomType.shortName, roomNumberLabel: roomType.roomNumberLabel,
      catalogueCategoryId: roomType.catalogueCategoryId === "none" ? null : roomType.catalogueCategoryId,
      shortDescription: roomType.shortDescription, capacityAdults: Number(roomType.capacityAdults),
      capacityChildren: Number(roomType.capacityChildren), maxOccupancy: Number(roomType.maxOccupancy),
      description: roomType.description.split("\n\n").map(v => v.trim()).filter(Boolean),
      details: roomType.details.split("\n").map(v => v.trim()).filter(Boolean).map(line => { const i=line.indexOf(":"); return i>0 ? {label:line.slice(0,i).trim(),value:line.slice(i+1).trim()} : null; }).filter(Boolean),
      ctaLine: roomType.ctaLine,
      status: roomType.status, sortOrder: Number(roomType.sortOrder), heroLine: roomType.heroLine, imageUrl: roomType.imageUrl,
      galleryUrls: roomType.galleryUrls.split("\n").map(v => v.trim()).filter(Boolean),
      sizeLabel: roomType.sizeLabel, viewLabel: roomType.viewLabel, bedLabel: roomType.bedLabel,
      bathroomLabel: roomType.bathroomLabel,
    }}),
    onSuccess: () => { toast.success("Platform room definition saved"); setRoomType(blankType()); qc.invalidateQueries({ queryKey: ["platform-room-catalogue"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = q.data?.categories ?? [];
  const types = q.data?.types ?? [];
  const editCategory = (c: any) => setCategory({
    id: c.id, slug: c.slug, name: c.name, description: c.description ?? "",
    features: (c.features ?? []).join("\n"), specifications: toLines(c.specifications),
    sortOrder: c.sort_order ?? 0, status: c.status,
  });
  const editType = (r: any) => setRoomType({
    id: r.id, slug: r.slug, name: r.name, shortName: r.short_name ?? "", roomNumberLabel: r.room_number_label ?? "", catalogueCategoryId: r.category_id ?? "none",
    shortDescription: r.short_description ?? "", capacityAdults: r.capacity_adults,
    capacityChildren: r.capacity_children, maxOccupancy: r.max_occupancy,
    description: (r.description ?? []).join("\n\n"), details: (r.details ?? []).map((d: any) => `${d.label}: ${d.value}`).join("\n"), ctaLine: r.cta_line ?? "", heroLine: r.hero_line ?? "",
    imageUrl: r.image_url ?? "", galleryUrls: (r.gallery_urls ?? []).join("\n"),
    sizeLabel: r.size_label ?? "", viewLabel: r.view_label ?? "", bedLabel: r.bed_label ?? "",
    bathroomLabel: r.bathroom_label ?? "", sortOrder: r.sort_order ?? 0,
    status: r.status === "archived" ? "inactive" : "active",
  });

  return <div className="space-y-6">
    <PageHeader title="Platform System Configuration" description="Authoritative shared accommodation definitions used by StayNas properties. Property inventory, rates, currency and availability remain property-owned." />
    {q.isLoading ? <p className="text-sm text-muted-foreground">Loading platform configuration…</p> :
      q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div><h2 className="text-lg font-semibold">System categories</h2><p className="text-sm text-muted-foreground">Shared classification, features, specifications and display order.</p></div>
          <div className="space-y-2">{categories.map((c: any) => <button type="button" key={c.id} onClick={() => editCategory(c)} className="w-full rounded-lg border p-3 text-left hover:bg-muted">
            <div className="flex justify-between gap-2"><strong>{c.name}</strong><span className="text-xs text-muted-foreground">{c.status}</span></div>
            <p className="text-xs text-muted-foreground">{c.slug} · {(c.features ?? []).length} features · {Object.keys(c.specifications ?? {}).length} specifications</p>
          </button>)}</div>
          <div className="space-y-3 border-t pt-4">
            <Input placeholder="Category name" value={category.name} onChange={e => setCategory({ ...category, name: e.target.value })} />
            <Input placeholder="Unique slug" value={category.slug} onChange={e => setCategory({ ...category, slug: e.target.value })} />
            <Textarea placeholder="Description" value={category.description} onChange={e => setCategory({ ...category, description: e.target.value })} />
            <Textarea placeholder="Features — one per line" value={category.features} onChange={e => setCategory({ ...category, features: e.target.value })} />
            <Textarea placeholder="Specifications — Label: value, one per line" value={category.specifications} onChange={e => setCategory({ ...category, specifications: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="number" min="0" placeholder="Display order" value={category.sortOrder} onChange={e => setCategory({ ...category, sortOrder: Number(e.target.value) })} />
              <Select value={category.status} onValueChange={v => setCategory({ ...category, status: v as "active" | "archived" })}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCategory(blankCategory())}>Clear</Button>
              <Button onClick={() => categoryMutation.mutate()} disabled={categoryMutation.isPending || !category.name || !category.slug}>{category.id ? "Update category" : "Add category"}</Button>
            </div>
          </div>
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div><h2 className="text-lg font-semibold">System room definitions</h2><p className="text-sm text-muted-foreground">Canonical room content, occupancy rules, images and category assignment. No property rates or physical inventory.</p></div>
          <div className="space-y-2">{types.map((r: any) => <button type="button" key={r.id} onClick={() => editType(r)} className="w-full rounded-lg border p-3 text-left hover:bg-muted">
            <div className="flex justify-between gap-2"><strong>{r.name}</strong><span className="text-xs text-muted-foreground">{r.status}</span></div>
            <p className="text-xs text-muted-foreground">{r.slug} · max occupancy {r.max_occupancy} · {r.capacity_adults} adults / {r.capacity_children} children</p>
          </button>)}</div>
          <div className="space-y-3 border-t pt-4">
            <Input placeholder="Room definition name" value={roomType.name} onChange={e => setRoomType({ ...roomType, name: e.target.value })} />
            <Input placeholder="Unique slug" value={roomType.slug} onChange={e => setRoomType({ ...roomType, slug: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Short display name (optional)" value={roomType.shortName} onChange={e => setRoomType({ ...roomType, shortName: e.target.value })} />
              <Input placeholder="Room number label (optional)" value={roomType.roomNumberLabel} onChange={e => setRoomType({ ...roomType, roomNumberLabel: e.target.value })} />
            </div>
            <Select value={roomType.catalogueCategoryId} onValueChange={v => setRoomType({ ...roomType, catalogueCategoryId: v })}>
              <SelectTrigger><SelectValue placeholder="System category" /></SelectTrigger>
              <SelectContent><SelectItem value="none">No category</SelectItem>{categories.filter((c: any) => c.status === "active").map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Textarea placeholder="Short description" value={roomType.shortDescription} onChange={e => setRoomType({ ...roomType, shortDescription: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input type="number" min="1" placeholder="Adults" value={roomType.capacityAdults} onChange={e => setRoomType({ ...roomType, capacityAdults: Number(e.target.value) })} />
              <Input type="number" min="0" placeholder="Children" value={roomType.capacityChildren} onChange={e => setRoomType({ ...roomType, capacityChildren: Number(e.target.value) })} />
              <Input type="number" min="1" placeholder="Maximum occupancy" value={roomType.maxOccupancy} onChange={e => setRoomType({ ...roomType, maxOccupancy: Number(e.target.value) })} />
            </div>
            <Textarea placeholder="Full guest-facing description — separate paragraphs with a blank line" value={roomType.description} onChange={e => setRoomType({ ...roomType, description: e.target.value })} />
            <Textarea placeholder="Guest-facing detail rows — Label: value, one per line" value={roomType.details} onChange={e => setRoomType({ ...roomType, details: e.target.value })} />
            <Input placeholder="Guest-facing call-to-action line" value={roomType.ctaLine} onChange={e => setRoomType({ ...roomType, ctaLine: e.target.value })} />
            <Input placeholder="Guest-facing hero line" value={roomType.heroLine} onChange={e => setRoomType({ ...roomType, heroLine: e.target.value })} />
            <Input placeholder="Primary image URL" value={roomType.imageUrl} onChange={e => setRoomType({ ...roomType, imageUrl: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Size" value={roomType.sizeLabel} onChange={e => setRoomType({ ...roomType, sizeLabel: e.target.value })} />
              <Input placeholder="View" value={roomType.viewLabel} onChange={e => setRoomType({ ...roomType, viewLabel: e.target.value })} />
              <Input placeholder="Bed" value={roomType.bedLabel} onChange={e => setRoomType({ ...roomType, bedLabel: e.target.value })} />
              <Input placeholder="Bathroom" value={roomType.bathroomLabel} onChange={e => setRoomType({ ...roomType, bathroomLabel: e.target.value })} />
            </div>
            <Textarea placeholder="Gallery image URLs — one per line" value={roomType.galleryUrls} onChange={e => setRoomType({ ...roomType, galleryUrls: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="number" min="0" placeholder="Display order" value={roomType.sortOrder} onChange={e => setRoomType({ ...roomType, sortOrder: Number(e.target.value) })} />
              <Select value={roomType.status} onValueChange={v => setRoomType({ ...roomType, status: v as "active" | "inactive" })}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Archived</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRoomType(blankType())}>Clear</Button>
              <Button onClick={() => typeMutation.mutate()} disabled={typeMutation.isPending || !roomType.name || !roomType.slug}>{roomType.id ? "Update definition" : "Add definition"}</Button>
            </div>
          </div>
        </section>
      </div>}
  </div>;
}
