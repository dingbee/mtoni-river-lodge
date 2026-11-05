import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Archive, Copy, History, Pencil, Upload, PauseCircle, GitBranch, CalendarDays, Trash2 } from "lucide-react";
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
  const [seasonKey,setSeasonKey]=useState("");
  const [seasonName,setSeasonName]=useState("");
  const [seasonDescription,setSeasonDescription]=useState("");
  const [seasonType,setSeasonType]=useState<"low"|"shoulder"|"high"|"peak"|"festive"|"event"|"custom">("low");
  const [seasonStart,setSeasonStart]=useState("");
  const [seasonEnd,setSeasonEnd]=useState("");
  const [seasonRate,setSeasonRate]=useState("");
  const [seasonPriority,setSeasonPriority]=useState("10");
  const [seasonRoomTypes,setSeasonRoomTypes]=useState<string[]>([]);
  const [seasonActive,setSeasonActive]=useState(true);
  const [dailyDate,setDailyDate]=useState("");
  const [dailyRoomType,setDailyRoomType]=useState("");
  const [dailyRate,setDailyRate]=useState("");
  const [dailyActive,setDailyActive]=useState(true);
  const [restrictionKey,setRestrictionKey]=useState("");
  const [restrictionType,setRestrictionType]=useState<"min_los"|"max_los"|"closed_to_arrival"|"closed_to_departure"|"stop_sell"|"advance_booking_min_hours"|"advance_booking_max_days">("min_los");
  const [restrictionStart,setRestrictionStart]=useState("");
  const [restrictionEnd,setRestrictionEnd]=useState("");
  const [restrictionValue,setRestrictionValue]=useState("");
  const [restrictionRoomTypes,setRestrictionRoomTypes]=useState<string[]>([]);
  const [restrictionReason,setRestrictionReason]=useState("");
  const [restrictionActive,setRestrictionActive]=useState(true);

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
  const readSeasonalRates=():Record<string,Record<string,unknown>>=>{
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as {seasonal_rates?:Record<string,Record<string,unknown>>};
      return parsed.seasonal_rates??{};
    } catch { return {}; }
  };
  const addSeason=()=>{
    if(!seasonKey.trim()||!seasonName.trim()||!seasonStart||!seasonEnd||!seasonRate||!seasonRoomTypes.length){
      toast.error("Complete the season key, name, dates, nightly rate and at least one room type.");
      return;
    }
    if(seasonEnd<seasonStart){toast.error("Season end date must be on or after its start date.");return;}
    const nightlyRate=Number(seasonRate), priority=Number(seasonPriority);
    if(!Number.isFinite(nightlyRate)||nightlyRate<=0||!Number.isInteger(priority)||priority<0){
      toast.error("Enter a positive nightly rate and a non-negative whole-number priority.");
      return;
    }
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as Record<string,unknown>;
      const seasons=(parsed.seasonal_rates&&typeof parsed.seasonal_rates==="object"?parsed.seasonal_rates:{}) as Record<string,unknown>;
      if(seasons[seasonKey.trim()]){toast.error("A season with this key already exists. Edit the JSON entry or choose another key.");return;}
      seasons[seasonKey.trim()]={name:seasonName.trim(),description:seasonDescription.trim(),season_type:seasonType,start_date:seasonStart,end_date:seasonEnd,room_type_ids:seasonRoomTypes,currency:String(data?.property?.currency??"").toUpperCase(),nightly_rate:nightlyRate,priority,active:seasonActive};
      parsed.seasonal_rates=seasons;
      setRatePlanDataText(JSON.stringify(parsed,null,2));
      setSeasonKey("");setSeasonName("");setSeasonDescription("");setSeasonStart("");setSeasonEnd("");setSeasonRate("");setSeasonPriority("10");setSeasonRoomTypes([]);setSeasonActive(true);
      toast.success("Season added to the rate plan. Save the rate plan to validate and persist it.");
    } catch { toast.error("Fix the rate-data JSON before adding a season."); }
  };
  const removeSeason=(key:string)=>{
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as Record<string,unknown>;
      const seasons=(parsed.seasonal_rates??{}) as Record<string,unknown>;
      delete seasons[key];parsed.seasonal_rates=seasons;
      setRatePlanDataText(JSON.stringify(parsed,null,2));
    } catch { toast.error("Fix the rate-data JSON before removing a season."); }
  };
  const seasonalEntries=Object.entries(readSeasonalRates()).filter(([,value])=>value&&typeof value==="object");
  const readDailyRates=():Record<string,Record<string,unknown>>=>{
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as {daily_rates?:Record<string,Record<string,unknown>>};
      return parsed.daily_rates??{};
    } catch { return {}; }
  };
  const addDailyRate=()=>{
    if(!dailyDate||!dailyRoomType||!dailyRate){toast.error("Choose a date and room type, then enter a nightly rate.");return;}
    const amount=Number(dailyRate);
    if(!Number.isFinite(amount)||amount<=0){toast.error("Daily nightly rate must be a positive number.");return;}
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as Record<string,unknown>;
      const dates=(parsed.daily_rates&&typeof parsed.daily_rates==="object"?parsed.daily_rates:{}) as Record<string,Record<string,unknown>>;
      const rates={...(dates[dailyDate]??{})};
      if(rates[dailyRoomType]&&typeof rates[dailyRoomType]==="object"){toast.error("A daily rate already exists for this date and room type. Remove it first to replace it.");return;}
      rates[dailyRoomType]={nightly_rate:amount,currency:String(data?.property?.currency??"").toUpperCase(),active:dailyActive};
      dates[dailyDate]=rates;parsed.daily_rates=dates;
      setRatePlanDataText(JSON.stringify(parsed,null,2));
      setDailyDate("");setDailyRate("");setDailyActive(true);
      toast.success("Daily override added. Save the rate plan to validate and persist it.");
    } catch { toast.error("Fix the rate-data JSON before adding a daily override."); }
  };
  const removeDailyRate=(date:string,roomTypeId:string)=>{
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as Record<string,unknown>;
      const dates=(parsed.daily_rates??{}) as Record<string,Record<string,unknown>>;
      dates[date]={...(dates[date]??{}),[roomTypeId]:null};
      parsed.daily_rates=dates;setRatePlanDataText(JSON.stringify(parsed,null,2));
    } catch { toast.error("Fix the rate-data JSON before clearing a daily override."); }
  };
  const dailyRateEntries=Object.entries(readDailyRates()).flatMap(([date,roomRates])=>
    roomRates&&typeof roomRates==="object"
      ? Object.entries(roomRates).filter(([,value])=>value&&typeof value==="object").map(([roomTypeId,value])=>({
          date,roomTypeId,value:value as Record<string,unknown>,
        }))
      : [],
  );

  const readRestrictions=():Record<string,Record<string,unknown>>=>{
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as {restrictions?:Record<string,Record<string,unknown>|null>};
      return Object.fromEntries(Object.entries(parsed.restrictions??{}).filter(([,value])=>value&&typeof value==="object")) as Record<string,Record<string,unknown>>;
    } catch { return {}; }
  };
  const assignedRestrictionRoomTypes=((roomTypeData?.roomTypes??[]) as {id:string;name:string}[]).filter((rt:{id:string})=>
    !!editing && (roomTypeData?.assignments??[]).some((a:{rate_plan_id:string;room_type_id:string;active:boolean})=>
      a.rate_plan_id===editing.id&&a.room_type_id===rt.id&&a.active,
    ),
  );
  const addRestriction=()=>{
    if(!editing){toast.error("Create the rate plan, assign room types, then edit it to add restrictions.");return;}
    if(!restrictionKey.trim()||!restrictionStart||!restrictionEnd||!restrictionRoomTypes.length||restrictionReason.trim().length<5){
      toast.error("Complete the rule key, dates, room types and reason.");return;
    }
    if(restrictionEnd<restrictionStart){toast.error("Restriction end date must be on or after its start date.");return;}
    if(restrictionRoomTypes.some(id=>!assignedRestrictionRoomTypes.some(rt=>rt.id===id))){
      toast.error("Restrictions can only target room types actively assigned to this rate plan.");return;
    }
    const requiresValue=["min_los","max_los","advance_booking_min_hours","advance_booking_max_days"].includes(restrictionType);
    const value=Number(restrictionValue);
    if(requiresValue&&(!restrictionValue||!Number.isInteger(value)||value<0)){
      toast.error("Enter a whole-number value for this restriction.");return;
    }
    if((restrictionType==="min_los"||restrictionType==="max_los")&&(value<1||value>365)){
      toast.error("Length of stay must be between 1 and 365 nights.");return;
    }
    if(restrictionType==="advance_booking_min_hours"&&value>87600){
      toast.error("Minimum advance booking must not exceed 87,600 hours.");return;
    }
    if(restrictionType==="advance_booking_max_days"&&value>3650){
      toast.error("Maximum advance booking must not exceed 3,650 days.");return;
    }
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as Record<string,unknown>;
      const restrictions=(parsed.restrictions&&typeof parsed.restrictions==="object"?parsed.restrictions:{}) as Record<string,unknown>;
      if(Object.prototype.hasOwnProperty.call(restrictions,restrictionKey.trim())&&restrictions[restrictionKey.trim()]!==null){
        toast.error("A restriction with this key already exists. Choose another key or clear the existing rule first.");return;
      }
      restrictions[restrictionKey.trim()] = {
        type:restrictionType,
        ...(requiresValue?{value}:{}),
        start_date:restrictionStart,
        end_date:restrictionEnd,
        room_type_ids:restrictionRoomTypes,
        active:restrictionActive,
        reason:restrictionReason.trim(),
      };
      parsed.restrictions=restrictions;
      setRatePlanDataText(JSON.stringify(parsed,null,2));
      setRestrictionKey("");setRestrictionStart("");setRestrictionEnd("");setRestrictionValue("");
      setRestrictionRoomTypes([]);setRestrictionReason("");setRestrictionActive(true);
      toast.success("Restriction added. Save the rate plan to validate and persist it.");
    } catch { toast.error("Fix the rate-data JSON before adding a restriction."); }
  };
  const removeRestriction=(key:string)=>{
    try {
      const parsed=JSON.parse(ratePlanDataText||"{}") as Record<string,unknown>;
      const restrictions=(parsed.restrictions??{}) as Record<string,unknown>;
      restrictions[key]=null;
      parsed.restrictions=restrictions;
      setRatePlanDataText(JSON.stringify(parsed,null,2));
    } catch { toast.error("Fix the rate-data JSON before clearing a restriction."); }
  };
  const restrictionEntries=Object.entries(readRestrictions());
  return <div className="space-y-6">
    <PageHeader title="Rate Plans" description="Manage property-scoped commercial accommodation products, room eligibility, seasonal pricing, daily rate overrides and publication." />
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
        <label className="md:col-span-3 space-y-1 text-sm"><span className="font-medium">Advanced inheritance data (JSON)</span><textarea className="min-h-40 w-full rounded-md border border-border bg-background p-3 font-mono text-xs" value={ratePlanDataText} onChange={e=>setRatePlanDataText(e.target.value)} spellCheck={false}/><span className="block text-xs text-muted-foreground">Allowed keys: base_rates, seasonal_rates, daily_rates, occupancy_rules, restrictions. Seasonal and daily rates can be managed above. Use keyed objects; JSON null explicitly clears an inherited key.</span></label>
      </div>
      <div className="mt-5 rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4"/><h3 className="text-sm font-semibold">Seasonal pricing</h3></div>
        <p className="text-xs text-muted-foreground">Add low, shoulder, high, peak, festive, event or custom seasons. Dates are inclusive property-local calendar dates; annual recurrence is not enabled. Higher priority wins when active seasons overlap.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Season key (e.g. festive-2027)" value={seasonKey} onChange={e=>setSeasonKey(e.target.value)}/>
          <Input placeholder="Season name" value={seasonName} onChange={e=>setSeasonName(e.target.value)}/>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={seasonType} onChange={e=>setSeasonType(e.target.value as typeof seasonType)}>{["low","shoulder","high","peak","festive","event","custom"].map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select>
          <Input placeholder="Description" value={seasonDescription} onChange={e=>setSeasonDescription(e.target.value)}/>
          <Input type="date" aria-label="Season start date" value={seasonStart} onChange={e=>setSeasonStart(e.target.value)}/>
          <Input type="date" aria-label="Season end date" value={seasonEnd} onChange={e=>setSeasonEnd(e.target.value)}/>
          <Input type="number" placeholder="Nightly rate" value={seasonRate} onChange={e=>setSeasonRate(e.target.value)}/>
          <Input type="number" placeholder="Priority (higher wins)" value={seasonPriority} onChange={e=>setSeasonPriority(e.target.value)}/>
          <div className="flex items-center gap-2 text-sm"><input type="checkbox" checked={seasonActive} onChange={e=>setSeasonActive(e.target.checked)}/>Active season <Badge variant="outline">{String(data?.property?.currency??"").toUpperCase()}</Badge></div>
        </div>
        <div className="space-y-2"><p className="text-xs font-medium">Applicable room types</p><div className="flex flex-wrap gap-4">{(roomTypeData?.roomTypes??[]).map((rt:{id:string;name:string})=><label key={rt.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={seasonRoomTypes.includes(rt.id)} onChange={e=>setSeasonRoomTypes(current=>e.target.checked?[...current,rt.id]:current.filter(id=>id!==rt.id))}/>{rt.name}</label>)}</div></div>
        <Button type="button" variant="outline" onClick={addSeason}><Plus className="mr-2 h-4 w-4"/>Add season</Button>
        {seasonalEntries.length>0&&<div className="space-y-2">{seasonalEntries.map(([key,value])=><div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"><div><span className="font-medium">{String(value.name??key)}</span><span className="ml-2 text-xs text-muted-foreground">{String(value.start_date??"")} → {String(value.end_date??"")} · {String(value.nightly_rate??"")} {String(value.currency??"")} · priority {String(value.priority??"—")}</span></div><Button type="button" size="icon" variant="ghost" aria-label={"Remove season "+key} onClick={()=>removeSeason(key)}><Trash2 className="h-4 w-4"/></Button></div>)}</div>}
      </div>
      <div className="mt-5 rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4"/><h3 className="text-sm font-semibold">Daily rate calendar</h3></div>
        <p className="text-xs text-muted-foreground">Set an exact-date nightly override for an individual room type. Dates use the property-local calendar. Active daily overrides take precedence over seasonal and base rates for that night. Clearing a child entry reveals the inherited parent rate again.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Input type="date" aria-label="Daily rate date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)}/>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={dailyRoomType} onChange={e=>setDailyRoomType(e.target.value)}><option value="">Choose room type</option>{(roomTypeData?.roomTypes??[]).map((rt:{id:string;name:string})=><option key={rt.id} value={rt.id}>{rt.name}</option>)}</select>
          <Input type="number" min="0.01" step="0.01" placeholder="Nightly rate" value={dailyRate} onChange={e=>setDailyRate(e.target.value)}/>
          <div className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dailyActive} onChange={e=>setDailyActive(e.target.checked)}/>Active override <Badge variant="outline">{String(data?.property?.currency??"").toUpperCase()}</Badge></div>
        </div>
        <Button type="button" variant="outline" onClick={addDailyRate}><Plus className="mr-2 h-4 w-4"/>Add daily override</Button>
        {dailyRateEntries.length>0&&<div className="space-y-2">{dailyRateEntries.sort((a,b)=>a.date.localeCompare(b.date)).map(entry=><div key={entry.date+entry.roomTypeId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"><div><span className="font-medium">{entry.date}</span><span className="ml-2 text-xs text-muted-foreground">{(roomTypeData?.roomTypes??[]).find((rt:{id:string})=>rt.id===entry.roomTypeId)?.name??entry.roomTypeId} · {String(entry.value.nightly_rate??"")} {String(entry.value.currency??"")} · {entry.value.active===false?"Inactive":"Active"}</span></div><Button type="button" size="icon" variant="ghost" aria-label={"Clear daily rate "+entry.date} onClick={()=>removeDailyRate(entry.date,entry.roomTypeId)}><Trash2 className="h-4 w-4"/></Button></div>)}</div>}
      </div>
      <div className="mt-5 rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4"/><h3 className="text-sm font-semibold">Stay restrictions</h3></div>
        <p className="text-xs text-muted-foreground">Restrictions are separate from inventory. Stop-sell never changes room counts or blocked state. Length-of-stay and advance-booking rules use the arrival date; closed-to-departure checks the checkout date; stop-sell applies to any occupied night. Dates are property-local and inclusive.</p>
        {!editing?<p className="text-sm text-muted-foreground">Create this rate plan and assign room types first. Then edit it to configure restrictions.</p>:(
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <Input placeholder="Rule key (e.g. peak-min-stay)" value={restrictionKey} onChange={e=>setRestrictionKey(e.target.value)}/>
              <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={restrictionType} onChange={e=>setRestrictionType(e.target.value as typeof restrictionType)}>
                <option value="min_los">Minimum length of stay</option>
                <option value="max_los">Maximum length of stay</option>
                <option value="closed_to_arrival">Closed to arrival</option>
                <option value="closed_to_departure">Closed to departure</option>
                <option value="stop_sell">Stop sell</option>
                <option value="advance_booking_min_hours">Minimum advance booking (hours)</option>
                <option value="advance_booking_max_days">Maximum advance booking (days)</option>
              </select>
              {["min_los","max_los","advance_booking_min_hours","advance_booking_max_days"].includes(restrictionType)&&
                <Input type="number" min="0" step="1" placeholder={restrictionType==="min_los"||restrictionType==="max_los"?"Nights":restrictionType==="advance_booking_min_hours"?"Hours before arrival":"Days before arrival"} value={restrictionValue} onChange={e=>setRestrictionValue(e.target.value)}/>}
              <Input type="date" aria-label="Restriction effective from" value={restrictionStart} onChange={e=>setRestrictionStart(e.target.value)}/>
              <Input type="date" aria-label="Restriction effective to" min={restrictionStart||undefined} value={restrictionEnd} onChange={e=>setRestrictionEnd(e.target.value)}/>
              <Input placeholder="Reason shown when the stay is unsellable" maxLength={500} value={restrictionReason} onChange={e=>setRestrictionReason(e.target.value)}/>
            </div>
            <div className="space-y-2"><p className="text-xs font-medium">Assigned room types affected</p>
              <div className="flex flex-wrap gap-4">{assignedRestrictionRoomTypes.map((rt:{id:string;name:string})=>
                <label key={rt.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restrictionRoomTypes.includes(rt.id)} onChange={e=>setRestrictionRoomTypes(current=>e.target.checked?[...current,rt.id]:current.filter(id=>id!==rt.id))}/>{rt.name}</label>)}
                {!assignedRestrictionRoomTypes.length&&<span className="text-xs text-muted-foreground">Assign room types to this plan before adding restrictions.</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={restrictionActive} onChange={e=>setRestrictionActive(e.target.checked)}/>Active rule</label>
              <Button type="button" variant="outline" disabled={!assignedRestrictionRoomTypes.length} onClick={addRestriction}><Plus className="mr-2 h-4 w-4"/>Add restriction</Button>
            </div>
          </>
        )}
        {restrictionEntries.length>0&&<div className="space-y-2">{restrictionEntries.map(([key,value])=><div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <div><span className="font-medium">{key}</span><span className="ml-2 text-xs text-muted-foreground">{String(value.type).replaceAll("_"," ")} · {String(value.start_date)} → {String(value.end_date)} · {value.active===false?"Inactive":"Active"}{value.value!==undefined?" · "+String(value.value):""}</span><p className="text-xs text-muted-foreground">{String(value.reason??"")}</p></div>
          <Button type="button" size="icon" variant="ghost" aria-label={"Clear restriction "+key} onClick={()=>removeRestriction(key)}><Trash2 className="h-4 w-4"/></Button>
        </div>)}</div>}
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
