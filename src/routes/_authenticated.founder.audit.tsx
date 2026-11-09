import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, Search } from "lucide-react";
import { listFounderCommercialAudit } from "@/domains/commercial/founder-control-centre.functions";

export const Route=createFileRoute("/_authenticated/founder/audit")({
  head:()=>({meta:[{title:"Commercial Audit & Governance — StayNas Founder"},{name:"robots",content:"noindex,nofollow"}]}),
  beforeLoad:async()=>{const {getCommercialFounderStatus}=await import("@/domains/_platform/founder-admin.functions");const access=await getCommercialFounderStatus();if(!access.isFounderAdmin)throw redirect({to:"/settings"});},
  loader:()=>listFounderCommercialAudit(),
  component:FounderAudit,
});
type AuditRow=Record<string,unknown>&{id:string;action:string;resource_type:string;resource_ref:string;occurred_at:string;audit_source:string};
const date=(v:unknown)=>v?new Date(String(v)).toLocaleString():"—";
const label=(v:unknown)=>String(v??"—").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
function FounderAudit(){
  const events=Route.useLoaderData() as AuditRow[];
  const [search,setSearch]=useState("");
  const [source,setSource]=useState("all");
  const [outcome,setOutcome]=useState("all");
  const filtered=useMemo(()=>events.filter(e=>{
    const meta=JSON.stringify(e.metadata??{});
    const hay=[e.action,e.resource_type,e.resource_ref,e.actor_user_id,e.actor_role,e.reason_code,e.outcome,meta].join(" ").toLowerCase();
    return hay.includes(search.toLowerCase())&&(source==="all"||e.audit_source===source)&&(outcome==="all"||e.outcome===outcome);
  }),[events,search,source,outcome]);
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10"><div className="mx-auto max-w-[1440px] space-y-7">
    <a href="/founder" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Founder Commercial Control Centre</a>
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Governance</p><h1 className="mt-2 text-3xl font-semibold">Commercial Audit Register</h1><p className="mt-2 text-sm text-muted-foreground">Unified read-only view of commercial, financial and subscription lifecycle events. Audit records are never edited from this workspace.</p></header>
    <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Events loaded</p><p className="mt-2 text-2xl font-semibold">{events.length}</p></article><article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Denied operations</p><p className="mt-2 text-2xl font-semibold">{events.filter(e=>e.outcome==="denied").length}</p></article><article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Failed operations</p><p className="mt-2 text-2xl font-semibold">{events.filter(e=>e.outcome==="failed").length}</p></article></section>
    <section className="space-y-3"><div className="flex flex-col gap-2 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search actor, action, resource, reason or metadata" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"/></label><select value={source} onChange={e=>setSource(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All event sources</option><option value="commercial">Commercial</option><option value="financial">Financial</option><option value="subscription">Subscription</option></select><select value={outcome} onChange={e=>setOutcome(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All outcomes</option><option value="succeeded">Succeeded</option><option value="denied">Denied</option><option value="failed">Failed</option></select></div>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Resource</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Reason / evidence</th></tr></thead><tbody className="divide-y">{filtered.map((event,index)=><tr key={String(event.id??index)}><td className="px-4 py-3 text-xs">{date(event.occurred_at)}</td><td className="px-4 py-3">{label(event.audit_source)}</td><td className="px-4 py-3"><p>{label(event.actor_role)}</p><p className="text-xs text-muted-foreground">{String(event.actor_user_id??"System")}</p></td><td className="px-4 py-3 font-medium">{label(event.action)}</td><td className="px-4 py-3 text-xs">{String(event.resource_type)}<p className="text-muted-foreground">{String(event.resource_ref)}</p></td><td className="px-4 py-3">{label(event.outcome)}</td><td className="max-w-[320px] px-4 py-3 text-xs"><p>{String(event.reason_code??"—")}</p><details className="mt-1"><summary className="cursor-pointer underline">Evidence metadata</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">{JSON.stringify(event.metadata??{},null,2)}</pre></details></td></tr>)}{filtered.length===0&&<tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No audit events match the current filters.</td></tr>}</tbody></table></div>
    </section>
    <footer className="border-t pt-4 text-xs text-muted-foreground"><ClipboardList className="mr-1 inline size-3"/> Showing the latest 500 events per source. Full event history remains in the authoritative append-only ledger tables.</footer>
  </div></main>;
}
