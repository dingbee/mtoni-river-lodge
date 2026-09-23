import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, BedDouble, Maximize2, Users } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ConciergeWidget } from "@/components/site/ConciergeWidget";

export const Route = createFileRoute("/rooms/$slug")({ head: () => ({ meta: [{ title: "Room — StayNas" }, { name: "robots", content: "index,follow" }] }), component: RoomDetailPage });

type Room = {
  slug:string; name:string; short_description:string|null; base_price:number; currency:string; max_occupancy:number;
  hero_line:string|null; image_url:string|null; gallery_urls:string[]; size_label:string|null; view_label:string|null; bed_label:string|null; bathroom_label:string|null;
  category:{name:string;description:string|null;features:string[];specifications:Record<string,string>}|null;
};

function RoomDetailPage() {
  const {slug}=Route.useParams();
  const [room,setRoom]=useState<Room|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{fetch("/api/public/rooms/catalog?slug="+encodeURIComponent(slug)).then(r=>r.ok?r.json():Promise.reject()).then(d=>setRoom(d.rooms?.[0]??null)).catch(()=>setRoom(null)).finally(()=>setLoading(false));},[slug]);
  if(loading) return <div className="min-h-screen bg-background"><SiteHeader/><main className="mx-auto max-w-7xl px-6 py-20"><p>Loading room…</p></main><SiteFooter/></div>;
  if(!room) return <div className="min-h-screen bg-background"><SiteHeader/><main className="mx-auto max-w-7xl px-6 py-20"><h1 className="text-2xl font-semibold">Room not found</h1><Link className="mt-4 inline-flex items-center gap-2" to="/rooms"><ArrowLeft className="h-4 w-4"/>Back to rooms</Link></main><SiteFooter/></div>;
  const fmt=new Intl.NumberFormat("en-US",{style:"currency",currency:room.currency,maximumFractionDigits:0});
  return <div className="min-h-screen bg-background text-foreground"><SiteHeader/><main>
    <section className="border-b bg-muted/30 px-6 py-10 lg:px-10 lg:py-14"><div className="mx-auto max-w-7xl"><Link to="/rooms" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Back to rooms</Link><div className="mt-8 grid gap-10 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><span className="inline-flex rounded-full border bg-background px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]">{room.category?.name??"Accommodation"}</span><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{room.name}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{room.hero_line??room.short_description??"Configured accommodation."}</p></div><div className="rounded-2xl border bg-card p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rate</p><p className="mt-2 text-2xl font-semibold">{fmt.format(Number(room.base_price))} / night</p><Link to="/book" search={{room:room.slug}} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Check availability <ArrowRight className="h-4 w-4"/></Link></div></div></div></section>
    <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16"><div className="grid gap-10 lg:grid-cols-[1.2fr_.8fr]"><div className="overflow-hidden rounded-2xl border bg-muted shadow-sm">{room.image_url?<img src={room.image_url} alt={room.name} className="aspect-[4/3] h-full w-full object-cover"/>:<div className="flex aspect-[4/3] items-center justify-center text-muted-foreground"><BedDouble className="h-16 w-16"/></div>}</div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">About the room</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{room.category?.name??"Accommodation"}</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">{room.short_description??room.category?.description}</p><div className="mt-8 grid grid-cols-2 gap-3"><Meta icon={<Users className="h-4 w-4"/>} label={"Up to "+room.max_occupancy+" guests"}/><Meta icon={<BedDouble className="h-4 w-4"/>} label={room.bed_label??"Configured"}/><Meta icon={<Maximize2 className="h-4 w-4"/>} label={room.size_label??"—"}/><Meta icon={<span className="text-sm">◉</span>} label={room.view_label??"—"}/></div></div></div></section>
    <section className="border-y bg-muted/20 px-6 py-12 lg:px-10 lg:py-16"><div className="mx-auto max-w-7xl"><div className="grid gap-10 md:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Features</p>{room.category?.features?.length?<ul className="mt-4 grid gap-2 sm:grid-cols-2">{room.category.features.map(f=><li key={f} className="rounded-lg border bg-card p-3 text-sm">{f}</li>)}</ul>:<p className="mt-3 text-sm text-muted-foreground">No features configured yet.</p>}</div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Specifications</p>{Object.keys(room.category?.specifications??{}).length?<dl className="mt-4 divide-y rounded-lg border bg-card">{Object.entries(room.category?.specifications??{}).map(([k,v])=><div key={k} className="flex justify-between gap-4 p-3 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>:<p className="mt-3 text-sm text-muted-foreground">No specifications configured yet.</p>}</div></div></div></section>
  </main><SiteFooter/><ConciergeWidget/></div>;
}
function Meta({icon,label}:{icon:ReactNode;label:string}) { return <div className="rounded-xl border bg-card p-4"><div className="text-primary">{icon}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{label}</p></div>; }
