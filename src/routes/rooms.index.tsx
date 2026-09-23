import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BedDouble, Maximize2, Users } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ConciergeWidget } from "@/components/site/ConciergeWidget";

export const Route = createFileRoute("/rooms/")({ component: RoomsIndexPage });

type PublicRoom = {
  slug: string; name: string; short_description: string | null; base_price: number; currency: string; total_units: number;
  size_label: string | null; view_label: string | null; bed_label: string | null; image_url: string | null;
  category: { name: string; features: string[]; specifications: Record<string,string> } | null;
};

function RoomsIndexPage() {
  const [rooms,setRooms] = useState<PublicRoom[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/public/rooms/catalog")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setRooms(d.rooms ?? []))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, []);
  return <div className="min-h-screen bg-background text-foreground"><SiteHeader/><main>
    <section className="border-b bg-muted/30 px-6 py-14 lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Accommodation</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">Rooms designed for the stay.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">Explore rooms configured by the property in StayNas. Availability, pricing and guest-facing specifications come from live property configuration.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
      {loading ? <p className="text-sm text-muted-foreground">Loading rooms…</p> : rooms.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center"><h2 className="text-xl font-semibold">No rooms configured yet.</h2><p className="mt-2 text-sm text-muted-foreground">Configure room types and categories in StayNas.</p></div> : <div className="grid gap-6 lg:grid-cols-3">{rooms.map(room => <RoomCard key={room.slug} room={room}/>)}</div>}
    </section>
  </main><SiteFooter/><ConciergeWidget/></div>;
}

function RoomCard({room}:{room:PublicRoom}) {
  const [availability,setAvailability] = useState<{available_units:number;total_units:number}|null>(null);
  useEffect(() => {
    let cancelled=false;
    fetch("/api/public/rooms/status").then(r=>r.ok?r.json():Promise.reject()).then(p=>{
      const i=p.rooms?.find((x:{slug:string})=>x.slug===room.slug);
      if(!cancelled && i) setAvailability({available_units:Number(i.available_units??0),total_units:Number(i.total_units??0)});
    }).catch(()=>undefined);
    return ()=>{cancelled=true;};
  },[room.slug]);
  const fmt=new Intl.NumberFormat("en-US",{style:"currency",currency:room.currency,maximumFractionDigits:0});
  return <article className="group overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="relative aspect-[4/3] overflow-hidden bg-muted">{room.image_url?<img src={room.image_url} alt={room.name} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-muted-foreground"><BedDouble className="h-12 w-12"/></div>}<span className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em]">{room.category?.name??"Room"}</span></div><div className="p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{room.bed_label??"Accommodation"}</p><h2 className="mt-2 text-2xl font-semibold">{room.name}</h2></div><p className="whitespace-nowrap text-right text-sm font-semibold text-primary">{fmt.format(Number(room.base_price))} / night</p></div><p className="mt-4 text-sm leading-6 text-muted-foreground">{room.short_description??"Configured accommodation."}</p><div className="mt-6 grid grid-cols-3 gap-3 border-y py-4"><Meta icon={<Users className="h-4 w-4"/>} label={"Up to "+room.max_occupancy+" guests"}/><Meta icon={<BedDouble className="h-4 w-4"/>} label={room.bed_label??"Configured"}/><Meta icon={<Maximize2 className="h-4 w-4"/>} label={room.size_label??"—"}/></div><div className="mt-6 flex items-end justify-between gap-4"><div><span className="text-xs text-muted-foreground">{room.view_label??""}</span><p className="mt-2 text-sm font-medium">{availability?availability.available_units+" of "+availability.total_units+" available":"Checking availability…"}</p></div><Link to="/rooms/$slug" params={{slug:room.slug}} className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium hover:bg-muted">View room <ArrowRight className="h-4 w-4"/></Link></div></div></article>;
}
function Meta({icon,label}:{icon:ReactNode;label:string}) { return <div className="min-w-0"><div className="flex items-center gap-1.5 text-primary">{icon}</div><p className="mt-1 truncate text-xs text-muted-foreground">{label}</p></div>; }
