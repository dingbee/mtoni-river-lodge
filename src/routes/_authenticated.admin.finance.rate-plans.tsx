import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Archive, Copy, History, Pencil, Upload, PauseCircle, GitBranch } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listStayNasRatePlans, saveStayNasRatePlan, setStayNasRatePlanPublication, listStayNasRatePlanVersions, listStayNasRatePlanRoomTypes, setStayNasRatePlanRoomType, resolveStayNasRatePlanInheritance } from "@/domains/finance/rate-plans.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/rate-plans")({
  head: () => ({ meta: [{ title: "Rate Plans — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RatePlans,
});

const CATEGORIES = [
  ["standard_flexible","Standard Flexible"],["non_refundable","Non-refundable"],["bed_breakfast","Bed & Breakfast"],
  ["half_board","Half Board"],["full_board","Full Board"],["corporate","Corporate"],["long_stay","Long Stay"],
  ["package","Package"],["negotiated","Negotiated"],
] as const;

type Plan = {
  id:string; code:string; name:string; description:string|null; category:string; pricing_basis:string; currency:string;
  meal_plan:string; refundable:boolean; effective_from:string|null; effective_to:string|null; parent_rate_plan_id:string|null;
  publication_status:string; active:boolean; version:number; cancellation_policy:Record<string,unknown>; booking_conditions:Record<string,unknown>; rate_plan_data:Record<string,unknown>;
};

function RatePlans() {
  const listFn=useServerFn(listStayNasRatePlans);
  const saveFn=useServerFn(saveStayNasRatePlan);
  const publishFn=useServerFn(setStayNasRatePlanPublication);
  const versionsFn=useServerFn(listStayNasRatePlanVersions);
  const roomTypesFn=useServerFn(listStayNasRatePlanRoomTypes);
  const setRoomTypeFn=useServerFn(setStayNasRatePlanRoomType);
  const resolveInheritanceFn=useServerFn(resolveStayNasRatePlanInheritance);
  const qc=useQueryClient();
  const {data,isLoading}=useQuery({queryKey:["staynas.rate-plans"],queryFn:()=>listFn()});
  const {data:roomTypeData}=useQuery({queryKey:["staynas.rate-plan-room-types"],queryFn:()=>roomTypesFn()});
  const [editing,setEditing]=useState<Plan|null>(null);
  const [code,setCode]=useState(""); const [name,setName]=useState(""); const [description,setDescription]=useState("");
  const [category,setCategory]=useState("standard_flexible"); const [basis,setBasis]=useState("per_room");
  const [mealPlan,setMealPlan]=useState("room_only"); const [refundable,setRefundable]=useState(true);
  const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [parent,setParent]=useState("");
  const [ratePlanDataText,setRatePlanDataText]=useState("{}");
  const [inheritancePreview,setInheritancePreview]=useState<Record<string,unknown>|null>(null);
  const [history,setHistory]=useState<{id:string;version:number;snapshot:Record<string,unknown>;created_at:string}[]|null>(null);

  const reset=()=>{setEditing(null);setCode("");setName("");setDescription("");setCategory("standard_flexible");setBasis("per_room");setMealPlan("room_only");setRefundable(true);setFrom("");setTo("");setParent("");setRatePlanDataText("{}");setInheritancePreview(null);};
  const startEdit=(p:Plan)=>{setEditing(p);setCode(p.code);setName(p.name);setDescription(p.description??"");setCategory(p.category);setBasis(p.pricing_basis);setMealPlan(p.meal_plan);setRefundable(p.refundable);setFrom(p.effective_from??"");setTo(p.effective_to??"");setParent(p.parent_rate_plan_id??"");setRatePlanDataText(JSON.stringify(p.rate_plan_data??{},null,2));setInheritancePreview(null);};
  const save=useMutation({
    mutationFn:()=>saveFn({data:{...(editing?{id:editing.id}:{}),code,name,description:description||null,category,pricing_basis:basis as "per_room"|"per_person"|"occupancy_based",meal_plan:mealPlan as "room_only"|"bed_breakfast"|"half_board"|"full_board"|"all_inclusive"|"custom",refundable,effective_from:from||null,effective_to:to||null,parent_rate_plan_id:parent||null,active:editing?.active??true,cancellation_policy:editing?.cancellation_policy??{},booking_conditions:editing?.booking_conditions??{},rate_plan_data:JSON.parse(ratePlanDataText||"{}")}}),
    onSuccess:()=>{toast.success("Rate plan saved");reset();qc.invalidateQueries({queryKey:["staynas.rate-plans"]});},
    onError:(e:unknown)=>toast.error((e as Error).message),
  });
  const changeStatus=useMutation({
    mutationFn:(p:{id:string;status:"published"|"suspended"|"archived"|"draft";active?:boolean})=>publishFn({data:{id:p.id,publication_status:p.status,active:p.active}}),
    onSuccess:()=>{toast.success("Rate plan status updated");qc.invalidateQueries({queryKey:["staynas.rate-plans"]});},
    onError:(e:unknown)=>toast.error((e as Error).message),
  });
  const loadHistory=async(id:string)=>{try{setHistory(await versionsFn({data:{id}}));}catch(e){toast.error((e as Error).message);}};
  const inheritanceMutation=useMutation({mutationFn:(id:string)=>resolveInheritanceFn({data:{id}}),onSuccess:(value)=>setInheritancePreview(value && typeof value === "object" ? value as Record<string,unknown> : {result:value}),onError:(e:unknown)=>toast.error((e as Error).message)});
  const roomTypeMutation=useMutation({mutationFn:(v:{rate_plan_id:string;room_type_id:string;active:boolean})=>setRoomTypeFn({data:v}),onSuccess:()=>{qc.invalidateQueries({queryKey:["staynas.rate-plan-room-types"]});toast.success("Room-type assignment updated");},onError:(e:unknown)=>toast.error((e as Error).message)});
  const duplicate=(p:Plan)=>{setEditing(null);setCode(p.code+"-COPY");setName(p.name+" copy");setDescription(p.description??"");setCategory(p.category);setBasis(p.pricing_basis);setMealPlan(p.meal_plan);setRefundable(p.refundable);setFrom(p.effective_from??"");setTo(p.effective_to??"");setParent(p.parent_rate_plan_id??"");setRatePlanDataText(JSON.stringify(p.rate_plan_data??{},null,2));window.scrollTo({top:0,behavior:"smooth"});};

  return <div className="space-y-6">
    <PageHeader title="Rate Plans" description="Manage property-scoped commercial accommodation products, eligibility and publication. Rate amounts and calendar rules are delivered in the next pricing milestones." />
    {data?.property&&<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{data.property.name}</span><Badge variant="outline">{String(data.property.currency).toUpperCase()}</Badge><span>{data.property.timezone}</span></div>}
    <SectionCard title={editing?"Edit rate plan":"Create rate plan"} description="A rate plan defines the commercial terms applied to one or more room types. Room assignments are managed separately.">
      <div className="grid gap-3 md:grid-cols-3">
        <Input placeholder="Plan code (e.g. FLEX)" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/>
        <Input placeholder="Rate plan name" value={name} onChange={e=>setName(e.target.value)}/>
        <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={basis} onChange={e=>setBasis(e.target.value)}><option value="per_room">Per room</option><option value="per_person">Per person</option><option value="occupancy_based">Occupancy-based</option></select>
        <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={mealPlan} onChange={e=>setMealPlan(e.target.value)}><option value="room_only">Room only</option><option value="bed_breakfast">Bed & Breakfast</option><option value="half_board">Half Board</option><option value="full_board">Full Board</option><option value="all_inclusive">All inclusive</option><option value="custom">Custom</option></select>
        <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={parent} onChange={e=>setParent(e.target.value)}><option value="">No parent — standalone</option>{(data?.plans??[]).filter((p:Plan)=>p.id!==editing?.id).map((p:Plan)=><option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select>
        <Input type="date" value={from} onChange={e=>setFrom(e.target.value)} aria-label="Effective from"/>
        <Input type="date" value={to} onChange={e=>setTo(e.target.value)} aria-label="Effective to"/>
        <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={refundable?"refundable":"non_refundable"} onChange={e=>setRefundable(e.target.value==="refundable")}><option value="refundable">Refundable</option><option value="non_refundable">Non-refundable</option></select>
        <Input className="md:col-span-3" placeholder="Description and booking conditions" value={description} onChange={e=>setDescription(e.target.value)}/>
        <label className="md:col-span-3 space-y-1 text-sm"><span className="font-medium">Inheritable rate data (JSON)</span><textarea className="min-h-40 w-full rounded-md border border-border bg-background p-3 font-mono text-xs" value={ratePlanDataText} onChange={e=>setRatePlanDataText(e.target.value)} spellCheck={false}/><span className="block text-xs text-muted-foreground">Allowed keys: base_rates, seasonal_rates, daily_rates, occupancy_rules, restrictions. Use keyed objects; JSON null explicitly clears an inherited key.</span></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Button disabled={!code.trim()||!name.trim()||save.isPending} onClick={()=>save.mutate()}><Plus className="mr-2 h-4 w-4"/>{editing?"Save changes":"Create rate plan"}</Button>{editing&&<Button variant="outline" onClick={reset}>Cancel edit</Button>}</div>
      <p className="mt-2 text-xs text-muted-foreground">Currency is inherited from the active property and cannot be overridden. New plans start as Draft. Missing rate-data keys inherit from the parent; matching child keys override parent values. Cancellation and refundability remain independent.</p>
    </SectionCard>

    {isLoading?<LoadingState/>:<SectionCard title="Property rate plans" description="Publication and activation are separate controls. Archived plans remain in history.">
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Plan</th><th>Category</th><th>Basis</th><th>Meal</th><th>Effective period</th><th>Room types</th><th>Status</th><th>Version</th><th>Actions</th></tr></thead><tbody>
      {(data?.plans??[]).map((p:Plan)=><tr key={p.id} className="border-b border-border/70"><td className="py-3"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.code} · {p.currency}</div></td><td>{CATEGORIES.find(([v])=>v===p.category)?.[1]??p.category}</td><td>{p.pricing_basis.replace("_"," ")}</td><td>{p.meal_plan.replaceAll("_"," ")}</td><td>{p.effective_from??"Any"} → {p.effective_to??"Open"}</td><td><div className="flex min-w-[180px] flex-col gap-1">{(roomTypeData?.roomTypes??[]).map((rt:{id:string;name:string})=>{const assigned=(roomTypeData?.assignments??[]).some((a:{rate_plan_id:string;room_type_id:string;active:boolean})=>a.rate_plan_id===p.id&&a.room_type_id===rt.id&&a.active);return <label key={rt.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={assigned} disabled={roomTypeMutation.isPending||p.publication_status==="published"||p.publication_status==="archived"} onChange={e=>roomTypeMutation.mutate({rate_plan_id:p.id,room_type_id:rt.id,active:e.target.checked})}/>{rt.name}</label>;})}{!(roomTypeData?.roomTypes?.length)&&<span className="text-xs text-muted-foreground">No room types configured</span>}</div></td><td><div className="flex flex-col gap-1"><Badge variant={p.publication_status==="published"?"default":"secondary"}>{p.publication_status}</Badge><span className="text-xs text-muted-foreground">{p.active?"Active":"Inactive"}</span></div></td><td>v{p.version}</td><td><div className="flex flex-wrap gap-1"><Button size="icon" variant="ghost" aria-label="Edit" disabled={p.publication_status !== "draft" && p.publication_status !== "suspended"} onClick={()=>startEdit(p)}><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label="Duplicate" onClick={()=>duplicate(p)}><Copy className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label="History" onClick={()=>void loadHistory(p.id)}><History className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label="Preview inheritance" onClick={()=>inheritanceMutation.mutate(p.id)}><GitBranch className="h-4 w-4"/></Button>{p.publication_status==="published"?<Button size="icon" variant="ghost" aria-label="Suspend" onClick={()=>changeStatus.mutate({id:p.id,status:"suspended"})}><PauseCircle className="h-4 w-4"/></Button>:p.publication_status!=="archived"?<Button size="icon" variant="ghost" aria-label="Publish" onClick={()=>changeStatus.mutate({id:p.id,status:"published"})}><Upload className="h-4 w-4"/></Button>:null}{p.publication_status!=="archived"&&<Button size="icon" variant="ghost" aria-label="Archive" onClick={()=>changeStatus.mutate({id:p.id,status:"archived",active:false})}><Archive className="h-4 w-4"/></Button>}</div></td></tr>)}
      {!data?.plans?.length&&<tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No rate plans yet. Create the first commercial plan above.</td></tr>}
      </tbody></table></div>
    </SectionCard>}
    {inheritancePreview&&<SectionCard title="Resolved rate-plan inheritance" description="Child values override matching parent keys. Cancellation, refundability and booking conditions are taken from the selected plan only."><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(inheritancePreview,null,2)}</pre><Button className="mt-2" variant="outline" onClick={()=>setInheritancePreview(null)}>Close preview</Button></SectionCard>}
    {history&&<SectionCard title="Rate plan version history" description="Immutable snapshots retained for audit."><div className="space-y-2">{history.map(v=><div key={v.id} className="rounded-md border border-border p-3 text-sm"><div className="font-medium">Version {v.version}</div><div className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(v.snapshot,null,2)}</pre></div>)}{!history.length&&<p className="text-sm text-muted-foreground">No version history found.</p>}</div></SectionCard>}
  </div>;
}
