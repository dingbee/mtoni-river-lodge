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
import { listPlatformRoomCatalogue, savePlatformRoomCategory, savePlatformRoomType } from "@/lib/platform-room-catalogue.functions";

export const Route = createFileRoute("/_authenticated/admin/operations/room-catalogue")({
  head: () => ({ meta: [{ title: "Platform System Configuration — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PlatformRoomConfiguration,
});
const newCategory = () => ({ id: undefined as string | undefined, slug:"", name:"", description:"", features:"", specifications:"", sortOrder:0, status:"active" as "active"|"archived" });
const newRoom = () => ({ id:undefined as string|undefined, slug:"", name:"", shortName:"", roomNumberLabel:"", categoryId:"none", shortDescription:"", description:"", details:"", ctaLine:"", heroLine:"", imageUrl:"", galleryUrls:"", sizeLabel:"", viewLabel:"", bedLabel:"", bathroomLabel:"", capacityAdults:2, capacityChildren:0, maxOccupancy:2, sortOrder:0, status:"active" as "active"|"inactive" });
const parsePairs = (s:string) => Object.fromEntries(s.split("\n").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf(":");return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:[x,""];}));
const showPairs = (v:Record<string,string>|null) => Object.entries(v??{}).map(([k,x])=>k+": "+x).join("\n");
function PlatformRoomConfiguration() {
  const qc=useQueryClient();
  const list=useServerFn(listPlatformRoomCatalogue), saveCat=useServerFn(savePlatformRoomCategory), saveRoom=useServerFn(savePlatformRoomType);
  const query=useQuery({queryKey:["platform-room-catalogue"],queryFn:()=>list()});
  const [cat,setCat]=useState(newCategory()), [room,setRoom]=useState(newRoom());
  const categories=query.data?.categories??[], types=query.data?.types??[];
  const refresh=()=>qc.invalidateQueries({queryKey:["platform-room-catalogue"]});
  const catMutation=useMutation({mutationFn:()=>saveCat({data:{id:cat.id,slug:cat.slug,name:cat.name,description:cat.description,features:cat.features.split("\n").map(x=>x.trim()).filter(Boolean),specifications:parsePairs(cat.specifications),sortOrder:Number(cat.sortOrder),status:cat.status}}),onSuccess:()=>{toast.success("Category saved");setCat(newCategory());refresh();},onError:(e:Error)=>toast.error(e.message)});
  const roomMutation=useMutation({mutationFn:()=>saveRoom({data:{id:room.id,slug:room.slug,name:room.name,shortName:room.shortName,roomNumberLabel:room.roomNumberLabel,categoryId:room.categoryId==="none"?null:room.categoryId,shortDescription:room.shortDescription,description:room.description.split("\n\n").map(x=>x.trim()).filter(Boolean),details:room.details.split("\n").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf(":");return i>0?{label:x.slice(0,i).trim(),value:x.slice(i+1).trim()}:null;}).filter(Boolean),ctaLine:room.ctaLine,heroLine:room.heroLine,imageUrl:room.imageUrl,galleryUrls:room.galleryUrls.split("\n").map(x=>x.trim()).filter(Boolean),sizeLabel:room.sizeLabel,viewLabel:room.viewLabel,bedLabel:room.bedLabel,bathroomLabel:room.bathroomLabel,capacityAdults:Number(room.capacityAdults),capacityChildren:Number(room.capacityChildren),maxOccupancy:Number(room.maxOccupancy),sortOrder:Number(room.sortOrder),status:room.status}}),onSuccess:()=>{toast.success("Room definition saved");setRoom(newRoom());refresh();},onError:(e:Error)=>toast.error(e.message)});
  const editCategory=(c:any)=>setCat({id:c.id,slug:c.slug,name:c.name,description:c.description??"",features:(c.features??[]).join("\n"),specifications:showPairs(c.specifications),sortOrder:c.sort_order??0,status:c.status});
  const editRoom=(r:any)=>setRoom({id:r.id,slug:r.slug,name:r.name,shortName:r.short_name??"",roomNumberLabel:r.room_number_label??"",categoryId:r.category_id??"none",shortDescription:r.short_description??"",description:(r.description??[]).join("\n\n"),details:(r.details??[]).map((x:any)=>x.label+": "+x.value).join("\n"),ctaLine:r.cta_line??"",heroLine:r.hero_line??"",imageUrl:r.image_url??"",galleryUrls:(r.gallery_urls??[]).join("\n"),sizeLabel:r.size_label??"",viewLabel:r.view_label??"",bedLabel:r.bed_label??"",bathroomLabel:r.bathroom_label??"",capacityAdults:r.capacity_adults,capacityChildren:r.capacity_children,maxOccupancy:r.max_occupancy,sortOrder:r.sort_order??0,status:r.status==="archived"?"inactive":"active"});
  const field=(label:string,value:string,onChange:(v:string)=>void)=><Input aria-label={label} placeholder={label} value={value} onChange={e=>onChange(e.target.value)}/>;
  return <div className="space-y-6">
    <PageHeader title="Platform System Configuration" description="One platform-owned catalogue of reusable room definitions. Property inventory, room numbers, pricing, currency and availability remain property-owned."/>
    {query.isLoading?<p>Loading system catalogue…</p>:query.isError?<p className="text-destructive">{(query.error as Error).message}</p>:<div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <header><h2 className="text-lg font-semibold">Accommodation categories</h2><p className="text-sm text-muted-foreground">Shared classification, category description, features and specifications.</p></header>
        <div className="space-y-2">{categories.map((c:any)=><button type="button" key={c.id} onClick={()=>editCategory(c)} className="w-full rounded-lg border p-3 text-left hover:bg-muted"><div className="flex justify-between"><b>{c.name}</b><span className="text-xs">{c.status}</span></div><p className="text-xs text-muted-foreground">{c.slug} · {(c.features??[]).length} features</p></button>)}</div>
        <div className="space-y-3 border-t pt-4">{field("Category name",cat.name,v=>setCat({...cat,name:v}))}{field("Unique slug",cat.slug,v=>setCat({...cat,slug:v}))}<Textarea placeholder="Category description" value={cat.description} onChange={e=>setCat({...cat,description:e.target.value})}/><Textarea placeholder="Features — one per line" value={cat.features} onChange={e=>setCat({...cat,features:e.target.value})}/><Textarea placeholder="Specifications — Label: value, one per line" value={cat.specifications} onChange={e=>setCat({...cat,specifications:e.target.value})}/><div className="grid grid-cols-2 gap-3"><Input type="number" min="0" value={cat.sortOrder} onChange={e=>setCat({...cat,sortOrder:Number(e.target.value)})}/><Select value={cat.status} onValueChange={v=>setCat({...cat,status:v as "active"|"archived"})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setCat(newCategory())}>Clear</Button><Button disabled={catMutation.isPending||!cat.name||!cat.slug} onClick={()=>catMutation.mutate()}>{cat.id?"Update category":"Create category"}</Button></div></div>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <header><h2 className="text-lg font-semibold">Room type definitions</h2><p className="text-sm text-muted-foreground">Historical guest-facing content, media, details and occupancy — independent of any property.</p></header>
        <div className="space-y-2">{types.map((r:any)=><button type="button" key={r.id} onClick={()=>editRoom(r)} className="w-full rounded-lg border p-3 text-left hover:bg-muted"><div className="flex justify-between"><b>{r.name}</b><span className="text-xs">{r.status}</span></div><p className="text-xs text-muted-foreground">{r.slug} · {r.capacity_adults} adults / {r.capacity_children} children · max {r.max_occupancy}</p></button>)}</div>
        <div className="space-y-3 border-t pt-4">
          {field("Room type name",room.name,v=>setRoom({...room,name:v}))}{field("Unique slug",room.slug,v=>setRoom({...room,slug:v}))}
          <div className="grid grid-cols-2 gap-3">{field("Short display name",room.shortName,v=>setRoom({...room,shortName:v}))}{field("Room number label",room.roomNumberLabel,v=>setRoom({...room,roomNumberLabel:v}))}</div>
          <Select value={room.categoryId} onValueChange={v=>setRoom({...room,categoryId:v})}><SelectTrigger><SelectValue placeholder="Category"/></SelectTrigger><SelectContent><SelectItem value="none">Uncategorised</SelectItem>{categories.filter((c:any)=>c.status==="active").map((c:any)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          <Textarea placeholder="Short description" value={room.shortDescription} onChange={e=>setRoom({...room,shortDescription:e.target.value})}/>
          <Textarea placeholder="Full description paragraphs — leave a blank line between paragraphs" value={room.description} onChange={e=>setRoom({...room,description:e.target.value})}/>
          <Textarea placeholder="Guest detail rows — Label: value, one per line" value={room.details} onChange={e=>setRoom({...room,details:e.target.value})}/>
          {field("Guest-facing CTA line",room.ctaLine,v=>setRoom({...room,ctaLine:v}))}{field("Hero line",room.heroLine,v=>setRoom({...room,heroLine:v}))}{field("Primary image URL",room.imageUrl,v=>setRoom({...room,imageUrl:v}))}
          <div className="grid grid-cols-2 gap-3">{field("Room size",room.sizeLabel,v=>setRoom({...room,sizeLabel:v}))}{field("View",room.viewLabel,v=>setRoom({...room,viewLabel:v}))}{field("Bed",room.bedLabel,v=>setRoom({...room,bedLabel:v}))}{field("Bathroom",room.bathroomLabel,v=>setRoom({...room,bathroomLabel:v}))}</div>
          <Textarea placeholder="Gallery image URLs — one per line" value={room.galleryUrls} onChange={e=>setRoom({...room,galleryUrls:e.target.value})}/>
          <div className="grid grid-cols-3 gap-3"><Input aria-label="Adults" type="number" min="1" value={room.capacityAdults} onChange={e=>setRoom({...room,capacityAdults:Number(e.target.value)})}/><Input aria-label="Children" type="number" min="0" value={room.capacityChildren} onChange={e=>setRoom({...room,capacityChildren:Number(e.target.value)})}/><Input aria-label="Maximum occupancy" type="number" min="1" value={room.maxOccupancy} onChange={e=>setRoom({...room,maxOccupancy:Number(e.target.value)})}/></div>
          <div className="grid grid-cols-2 gap-3"><Input aria-label="Display order" type="number" min="0" value={room.sortOrder} onChange={e=>setRoom({...room,sortOrder:Number(e.target.value)})}/><Select value={room.status} onValueChange={v=>setRoom({...room,status:v as "active"|"inactive"})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Archived</SelectItem></SelectContent></Select></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setRoom(newRoom())}>Clear</Button><Button disabled={roomMutation.isPending||!room.name||!room.slug} onClick={()=>roomMutation.mutate()}>{room.id?"Update room type":"Create room type"}</Button></div>
        </div>
      </section>
    </div>}
  </div>;
}
