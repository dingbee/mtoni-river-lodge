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
  head: () => ({ meta: [{ title: "Platform Room Catalogue — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PlatformRoomCataloguePage,
});

const blankCategory = () => ({ slug: "", name: "", description: "", features: "", specifications: "" });
const blankType = () => ({
  slug: "", name: "", catalogueCategoryId: "none", shortDescription: "", capacityAdults: 2,
  capacityChildren: 0, maxOccupancy: 2, heroLine: "", imageUrl: "", galleryUrls: "",
  sizeLabel: "", viewLabel: "", bedLabel: "", bathroomLabel: "",
});

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
      slug: category.slug, name: category.name, description: category.description,
      features: category.features.split("\n").map(v => v.trim()).filter(Boolean),
      specifications: Object.fromEntries(category.specifications.split("\n").map(v => v.trim()).filter(Boolean).map(line => {
        const i = line.indexOf(":"); return i > 0 ? [line.slice(0,i).trim(),line.slice(i+1).trim()] : [line,""];
      })),
    }}),
    onSuccess: () => { toast.success("Platform category saved"); setCategory(blankCategory()); qc.invalidateQueries({queryKey:["platform-room-catalogue"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const typeMutation = useMutation({
    mutationFn: () => saveTypeFn({ data: {
      slug: roomType.slug, name: roomType.name,
      catalogueCategoryId: roomType.catalogueCategoryId === "none" ? null : roomType.catalogueCategoryId,
      shortDescription: roomType.shortDescription, capacityAdults: Number(roomType.capacityAdults),
      capacityChildren: Number(roomType.capacityChildren), maxOccupancy: Number(roomType.maxOccupancy),
      status: "active", sortOrder: 0, heroLine: roomType.heroLine, imageUrl: roomType.imageUrl,
      galleryUrls: roomType.galleryUrls.split("\n").map(v => v.trim()).filter(Boolean),
      sizeLabel: roomType.sizeLabel, viewLabel: roomType.viewLabel, bedLabel: roomType.bedLabel,
      bathroomLabel: roomType.bathroomLabel,
    }}),
    onSuccess: () => { toast.success("Platform room type saved"); setRoomType(blankType()); qc.invalidateQueries({queryKey:["platform-room-catalogue"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = q.data?.categories ?? [];
  const types = q.data?.types ?? [];

  return <div className="space-y-6">
    <PageHeader title="Platform Room Catalogue" description="Shared room definitions for StayNas. Property inventory, rates, currency and availability remain independently managed by each property." />
    {q.isLoading ? <p className="text-sm text-muted-foreground">Loading platform catalogue…</p> :
      q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div><h2 className="text-lg font-semibold">Shared categories</h2><p className="text-sm text-muted-foreground">Platform-owned classifications, features and specifications.</p></div>
          <div className="space-y-2">{categories.map((c: any) => <div key={c.id} className="rounded-lg border p-3">
            <div className="flex justify-between gap-2"><strong>{c.name}</strong><span className="text-xs text-muted-foreground">{c.status}</span></div>
            <p className="text-xs text-muted-foreground">{c.slug} · {c.features.length} features</p>
          </div>)}</div>
          <div className="space-y-3 border-t pt-4">
            <Input placeholder="Category name" value={category.name} onChange={e=>setCategory({...category,name:e.target.value})}/>
            <Input placeholder="Unique slug" value={category.slug} onChange={e=>setCategory({...category,slug:e.target.value})}/>
            <Textarea placeholder="Description" value={category.description} onChange={e=>setCategory({...category,description:e.target.value})}/>
            <Textarea placeholder="Features — one per line" value={category.features} onChange={e=>setCategory({...category,features:e.target.value})}/>
            <Textarea placeholder="Specifications — Label: value, one per line" value={category.specifications} onChange={e=>setCategory({...category,specifications:e.target.value})}/>
            <Button onClick={()=>categoryMutation.mutate()} disabled={categoryMutation.isPending || !category.name || !category.slug}>Save platform category</Button>
          </div>
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div><h2 className="text-lg font-semibold">Shared room types</h2><p className="text-sm text-muted-foreground">Reusable room definitions. No property pricing or inventory is stored here.</p></div>
          <div className="space-y-2">{types.map((r: any) => <div key={r.id} className="rounded-lg border p-3">
            <div className="flex justify-between gap-2"><strong>{r.name}</strong><span className="text-xs text-muted-foreground">{r.status}</span></div>
            <p className="text-xs text-muted-foreground">{r.slug} · max occupancy {r.max_occupancy}</p>
          </div>)}</div>
          <div className="space-y-3 border-t pt-4">
            <Input placeholder="Room type name" value={roomType.name} onChange={e=>setRoomType({...roomType,name:e.target.value})}/>
            <Input placeholder="Unique slug" value={roomType.slug} onChange={e=>setRoomType({...roomType,slug:e.target.value})}/>
            <Select value={roomType.catalogueCategoryId} onValueChange={v=>setRoomType({...roomType,catalogueCategoryId:v})}>
              <SelectTrigger><SelectValue placeholder="Catalogue category"/></SelectTrigger>
              <SelectContent><SelectItem value="none">No category</SelectItem>{categories.filter((c:any)=>c.status==="active").map((c:any)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Textarea placeholder="Short description" value={roomType.shortDescription} onChange={e=>setRoomType({...roomType,shortDescription:e.target.value})}/>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input type="number" min="1" placeholder="Adults" value={roomType.capacityAdults} onChange={e=>setRoomType({...roomType,capacityAdults:Number(e.target.value)})}/>
              <Input type="number" min="0" placeholder="Children" value={roomType.capacityChildren} onChange={e=>setRoomType({...roomType,capacityChildren:Number(e.target.value)})}/>
              <Input type="number" min="1" placeholder="Max occupancy" value={roomType.maxOccupancy} onChange={e=>setRoomType({...roomType,maxOccupancy:Number(e.target.value)})}/>
            </div>
            <Input placeholder="Hero line" value={roomType.heroLine} onChange={e=>setRoomType({...roomType,heroLine:e.target.value})}/>
            <Input placeholder="Image URL" value={roomType.imageUrl} onChange={e=>setRoomType({...roomType,imageUrl:e.target.value})}/>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Size" value={roomType.sizeLabel} onChange={e=>setRoomType({...roomType,sizeLabel:e.target.value})}/>
              <Input placeholder="View" value={roomType.viewLabel} onChange={e=>setRoomType({...roomType,viewLabel:e.target.value})}/>
              <Input placeholder="Bed" value={roomType.bedLabel} onChange={e=>setRoomType({...roomType,bedLabel:e.target.value})}/>
              <Input placeholder="Bathroom" value={roomType.bathroomLabel} onChange={e=>setRoomType({...roomType,bathroomLabel:e.target.value})}/>
            </div>
            <Textarea placeholder="Gallery URLs — one per line" value={roomType.galleryUrls} onChange={e=>setRoomType({...roomType,galleryUrls:e.target.value})}/>
            <Button onClick={()=>typeMutation.mutate()} disabled={typeMutation.isPending || !roomType.name || !roomType.slug}>Save platform room type</Button>
          </div>
        </section>
      </div>}
  </div>;
}
