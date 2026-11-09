import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Bell, Check, CheckCheck, RefreshCw } from "lucide-react";
import {
  syncFounderCommercialNotifications, listFounderCommercialNotifications,
  acknowledgeFounderCommercialNotification, resolveFounderCommercialNotification,
} from "@/domains/commercial/founder-control-centre.functions";

export const Route = createFileRoute("/_authenticated/founder/notifications")({
  head: () => ({ meta: [{ title: "Founder Commercial Alerts — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: async () => {
    await syncFounderCommercialNotifications();
    return listFounderCommercialNotifications();
  },
  component: FounderNotifications,
});

type AlertRow = {
  id: string; alert_type: string; severity: string; title: string; detail: string;
  resource_type: string; resource_ref: string; href: string; status: string;
  created_at: string; organisation_id: string | null;
};
const date=(value:unknown)=>value?new Date(String(value)).toLocaleString():"—";
const label=(value:unknown)=>String(value??"—").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

function FounderNotifications(){
  const rows=Route.useLoaderData() as AlertRow[];
  const router=useRouter();
  const [filter,setFilter]=useState("open");
  const [busyId,setBusyId]=useState("");
  const [notice,setNotice]=useState("");
  const filtered=useMemo(()=>rows.filter(row=>filter==="all"||row.status===filter),[rows,filter]);
  const open=rows.filter(row=>row.status==="open").length;
  const acknowledged=rows.filter(row=>row.status==="acknowledged").length;
  const resolved=rows.filter(row=>row.status==="resolved").length;
  const sync=async()=>{setBusyId("sync");setNotice("");try{await syncFounderCommercialNotifications();await router.invalidate();setNotice("Commercial alert sources refreshed.");}catch(e){setNotice(e instanceof Error?e.message:"Alert refresh failed.");}finally{setBusyId("");}};
  const action=async(id:string,kind:"acknowledge"|"resolve")=>{setBusyId(id);setNotice("");try{if(kind==="acknowledge")await acknowledgeFounderCommercialNotification({data:{notificationId:id}});else await resolveFounderCommercialNotification({data:{notificationId:id}});await router.invalidate();}catch(e){setNotice(e instanceof Error?e.message:"Notification action failed.");}finally{setBusyId("");}};
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10"><div className="mx-auto max-w-6xl space-y-7">
    <a href="/founder" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Founder Commercial Control Centre</a>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Commercial governance</p><h1 className="mt-2 text-3xl font-semibold">Founder Alerts</h1><p className="mt-2 text-sm text-muted-foreground">Deduplicated alerts generated from persisted subscription, invoice, payment, reconciliation and entitlement records.</p></div><button disabled={busyId==="sync"} onClick={()=>void sync()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className="size-4" />{busyId==="sync"?"Refreshing…":"Refresh alert sources"}</button></header>
    <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Open alerts</p><p className="mt-2 text-2xl font-semibold">{open}</p></article><article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Acknowledged</p><p className="mt-2 text-2xl font-semibold">{acknowledged}</p></article><article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Resolved</p><p className="mt-2 text-2xl font-semibold">{resolved}</p></article></section>
    <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Bell className="size-4" /><h2 className="font-semibold">Commercial alerts</h2></div><select value={filter} onChange={e=>setFilter(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="all">All alerts</option></select></div>
      <div className="space-y-3">{filtered.map(alert=><article key={alert.id} className="rounded-xl border bg-card p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className={alert.severity==="critical"?"rounded-full bg-red-100 px-2 py-1 text-xs text-red-800":alert.severity==="warning"?"rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800":"rounded-full bg-muted px-2 py-1 text-xs"}>{label(alert.severity)}</span><span className="text-xs text-muted-foreground">{label(alert.alert_type)}</span><span className="text-xs text-muted-foreground">· {label(alert.status)}</span></div><h3 className="font-semibold">{alert.title}</h3><p className="text-sm text-muted-foreground">{alert.detail}</p><p className="text-xs text-muted-foreground">{date(alert.created_at)} · {alert.resource_type} · {alert.resource_ref}</p><a href={alert.href} className="text-sm underline underline-offset-4">Open related record</a></div><div className="flex shrink-0 flex-wrap gap-2">{alert.status==="open"&&<button disabled={busyId===alert.id} onClick={()=>void action(alert.id,"acknowledge")} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs disabled:opacity-50"><Check className="size-3" /> Acknowledge</button>}{alert.status!=="resolved"&&<button disabled={busyId===alert.id} onClick={()=>void action(alert.id,"resolve")} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs disabled:opacity-50"><CheckCheck className="size-3" /> Resolve</button>}</div></div></article>)}
      {filtered.length===0&&<div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No alerts in this status. Alert records are generated only from actual persisted commercial events and state.</div>}</div>
    </section>
    {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <footer className="border-t pt-4 text-xs text-muted-foreground">Notification evidence is deduplicated and immutable. Acknowledgement and resolution are server-authorized and written to the commercial audit trail. Tenant notification channels are not reused.</footer>
  </div></main>;
}
