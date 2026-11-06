import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  listPricingAdjustments, savePricingTaxRule, savePricingFeeRule, savePricingPromotion,
} from "@/domains/finance/pricing-adjustments.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/pricing-adjustments")({
  head: () => ({ meta: [{ title: "Taxes, Fees & Promotions — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PricingAdjustments,
});

const emptyTax = () => ({ id:"", name:"", tax_code:"", calculation_type:"exclusive_percent", rate:"", currency:"", applies_to:"accommodation", is_compound:false, tax_mode:"exclusive", taxable_components:["accommodation","extras"], jurisdiction_code:"", display_label:"", priority:"100", valid_from:"", valid_to:"", active:true });
const emptyFee = () => ({ id:"", code:"", name:"", description:"", calculation_type:"fixed", amount:"", currency:"", applies_to:["accommodation"], taxable:false, tax_rule_ids:[], minimum_amount:"", maximum_amount:"", valid_from:"", valid_to:"", priority:"100", active:true });
const emptyPromo = () => ({ id:"", code:"", name:"", description:"", discount_type:"percentage", discount_value:"", currency:"", minimum_nights:"1", minimum_booking_value:"0", booking_window_from:"", booking_window_to:"", stay_from:"", stay_to:"", valid_from:"", valid_to:"", usage_limit:"", per_guest_limit:"", auto_apply:false, stackable:false, priority:"100", status:"draft" });
const dateOrNull = (v:string) => v || null;
const numOrNull = (v:string) => v.trim()==="" ? null : Number(v);
const isoOrNull = (v:string) => v ? new Date(v).toISOString() : null;

function PricingAdjustments() {
  const listFn=useServerFn(listPricingAdjustments);
  const saveTaxFn=useServerFn(savePricingTaxRule);
  const saveFeeFn=useServerFn(savePricingFeeRule);
  const savePromoFn=useServerFn(savePricingPromotion);
  const qc=useQueryClient();
  const {data,isLoading,error}=useQuery({queryKey:["staynas.pricing-adjustments"],queryFn:()=>listFn()});
  const [tax,setTax]=useState<any>(emptyTax());
  const [fee,setFee]=useState<any>(emptyFee());
  const [promo,setPromo]=useState<any>(emptyPromo());
  const [tab,setTab]=useState<"tax"|"fee"|"promo"|"audit">("tax");

  const refresh=()=>qc.invalidateQueries({queryKey:["staynas.pricing-adjustments"]});
  const taxSave=useMutation({mutationFn:()=>saveTaxFn({data:{
    ...(tax.id?{id:tax.id}:{}),name:tax.name,tax_code:tax.tax_code||null,
    calculation_type:tax.calculation_type,rate:Number(tax.rate),currency:tax.currency||data?.property.currency,
    applies_to:tax.applies_to,is_compound:tax.is_compound,valid_from:dateOrNull(tax.valid_from),valid_to:dateOrNull(tax.valid_to),
    tax_mode:tax.tax_mode,taxable_components:tax.taxable_components,jurisdiction_code:tax.jurisdiction_code||null,
    display_label:tax.display_label||null,priority:Number(tax.priority),active:tax.active,
  }}),onSuccess:()=>{toast.success("Tax rule saved");setTax(emptyTax());refresh();},onError:(e:unknown)=>toast.error((e as Error).message)});
  const feeSave=useMutation({mutationFn:()=>saveFeeFn({data:{
    ...(fee.id?{id:fee.id}:{}),code:fee.code,name:fee.name,description:fee.description||null,
    calculation_type:fee.calculation_type,amount:Number(fee.amount),currency:fee.currency||data?.property.currency,
    applies_to:fee.applies_to,taxable:fee.taxable,tax_rule_ids:fee.tax_rule_ids??[],minimum_amount:numOrNull(fee.minimum_amount),
    maximum_amount:numOrNull(fee.maximum_amount),valid_from:dateOrNull(fee.valid_from),valid_to:dateOrNull(fee.valid_to),
    priority:Number(fee.priority),active:fee.active,
  }}),onSuccess:()=>{toast.success("Fee rule saved");setFee(emptyFee());refresh();},onError:(e:unknown)=>toast.error((e as Error).message)});
  const promoSave=useMutation({mutationFn:()=>savePromoFn({data:{
    ...(promo.id?{id:promo.id}:{}),code:promo.code||null,name:promo.name,description:promo.description||null,
    discount_type:promo.discount_type,discount_value:Number(promo.discount_value),currency:promo.currency||data?.property.currency,
    eligible_room_ids:promo.eligible_room_ids??[],eligible_rate_plan_ids:promo.eligible_rate_plan_ids??[],minimum_nights:Number(promo.minimum_nights),
    minimum_booking_value:Number(promo.minimum_booking_value),booking_window_from:dateOrNull(promo.booking_window_from),
    booking_window_to:dateOrNull(promo.booking_window_to),stay_from:dateOrNull(promo.stay_from),stay_to:dateOrNull(promo.stay_to),
    valid_from:isoOrNull(promo.valid_from),valid_to:isoOrNull(promo.valid_to),
    usage_limit:numOrNull(promo.usage_limit),per_guest_limit:numOrNull(promo.per_guest_limit),
    auto_apply:promo.auto_apply,stackable:false,priority:Number(promo.priority),status:promo.status,
  }}),onSuccess:()=>{toast.success("Promotion saved");setPromo(emptyPromo());refresh();},onError:(e:unknown)=>toast.error((e as Error).message)});

  const field="grid gap-1.5 text-xs text-muted-foreground";
  const textInput="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
  const selectCls="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
  const tabs=[["tax","Taxes"],["fee","Fees"],["promo","Promotions"],["audit","Audit history"]] as const;

  return <div className="space-y-6">
    <PageHeader title="Taxes, Fees & Promotions" description={data?.property ? data.property.name+" · "+data.property.currency+" · "+data.property.timezone : "Property-scoped pricing adjustments"} />
    <div className="flex flex-wrap gap-2 border-b border-border pb-3">
      {tabs.map(([key,label])=><Button key={key} size="sm" variant={tab===key?"default":"outline"} onClick={()=>setTab(key)}>{label}</Button>)}
    </div>
    {isLoading && <p className="text-sm text-muted-foreground">Loading pricing configuration…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{(error as Error).message}</p>}
    {tab==="tax" && <>
      <SectionCard title={tax.id?"Edit tax rule":"Create tax rule"} description="Tax rules are property-scoped. Configure jurisdiction and applicability explicitly; StayNas does not assume a country tax rate.">
        <form className="grid gap-4 md:grid-cols-3" onSubmit={e=>{e.preventDefault();taxSave.mutate();}}>
          <label className={field}>Name<Input required value={tax.name} onChange={e=>setTax({...tax,name:e.target.value})}/></label>
          <label className={field}>Tax code<Input value={tax.tax_code} onChange={e=>setTax({...tax,tax_code:e.target.value})}/></label>
          <label className={field}>Calculation<select className={selectCls} value={tax.calculation_type} onChange={e=>setTax({...tax,calculation_type:e.target.value,tax_mode:e.target.value==="inclusive_percent"?"inclusive":"exclusive"})}><option value="exclusive_percent">Exclusive percentage</option><option value="inclusive_percent">Inclusive percentage</option><option value="fixed_per_night">Fixed per night</option><option value="fixed_per_booking">Fixed per booking</option></select></label>
          <label className={field}>Rate / amount<Input required type="number" min="0" step="0.0001" value={tax.rate} onChange={e=>setTax({...tax,rate:e.target.value})}/></label>
          <label className={field}>Currency (blank = property currency)<Input maxLength={3} value={tax.currency} onChange={e=>setTax({...tax,currency:e.target.value.toUpperCase()})} placeholder={data?.property.currency}/></label>
          <label className={field}>Jurisdiction code<Input value={tax.jurisdiction_code} onChange={e=>setTax({...tax,jurisdiction_code:e.target.value})}/></label>
          <label className={field}>Display label<Input value={tax.display_label} onChange={e=>setTax({...tax,display_label:e.target.value})}/></label>
          <label className={field}>Tax applies to<select className={selectCls} value={tax.applies_to} onChange={e=>setTax({...tax,applies_to:e.target.value})}><option value="accommodation">Accommodation</option><option value="extras">Extras</option><option value="all">All legacy components</option></select></label>
          <label className={field}>Taxable components<select multiple className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={tax.taxable_components} onChange={e=>setTax({...tax,taxable_components:Array.from(e.target.selectedOptions).map(o=>o.value)})}><option value="accommodation">Accommodation</option><option value="extras">Extras</option><option value="fee">Fees</option></select></label>
          <label className={field}>Priority<Input type="number" min="0" value={tax.priority} onChange={e=>setTax({...tax,priority:e.target.value})}/></label>
          <label className={field}>Effective from<Input type="date" value={tax.valid_from} onChange={e=>setTax({...tax,valid_from:e.target.value})}/></label>
          <label className={field}>Effective to<Input type="date" value={tax.valid_to} onChange={e=>setTax({...tax,valid_to:e.target.value})}/></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tax.is_compound} onChange={e=>setTax({...tax,is_compound:e.target.checked})}/> Compound on preceding tax</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tax.active} onChange={e=>setTax({...tax,active:e.target.checked})}/> Active</label>
          <div className="flex gap-2 md:col-span-3"><Button type="submit" disabled={taxSave.isPending||!tax.name||tax.rate===""}>{taxSave.isPending?"Saving…":tax.id?"Update tax rule":"Save tax rule"}</Button><Button type="button" variant="outline" onClick={()=>setTax(emptyTax())}>Clear</Button></div>
        </form>
      </SectionCard>
      <SectionCard title="Property tax rules"><div className="divide-y divide-border">{(data?.taxes??[]).map((r:any)=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="font-medium text-sm">{r.name} <Badge variant={r.active?"default":"secondary"}>{r.active?"Active":"Inactive"}</Badge></div><p className="text-xs text-muted-foreground">{r.tax_code||"No code"} · {r.calculation_type} · {r.rate} {r.currency||data?.property.currency} · priority {r.priority}</p></div><Button size="sm" variant="outline" onClick={()=>{setTax({...r,rate:String(r.rate),priority:String(r.priority),currency:r.currency||"",valid_from:r.valid_from||"",valid_to:r.valid_to||"",taxable_components:r.taxable_components||["accommodation","extras"]});window.scrollTo({top:0,behavior:"smooth"});}}>Edit</Button></div>)}{!data?.taxes?.length&&<p className="py-4 text-sm text-muted-foreground">No tax rules configured.</p>}</div></SectionCard>
    </>}
    {tab==="fee" && <>
      <SectionCard title={fee.id?"Edit fee rule":"Create fee rule"} description="Configure fixed, percentage, per-night, per-guest, per-booking or per-room fees.">
        <form className="grid gap-4 md:grid-cols-3" onSubmit={e=>{e.preventDefault();feeSave.mutate();}}>
          <label className={field}>Code<Input required value={fee.code} onChange={e=>setFee({...fee,code:e.target.value})}/></label>
          <label className={field}>Name<Input required value={fee.name} onChange={e=>setFee({...fee,name:e.target.value})}/></label>
          <label className={field}>Calculation<select className={selectCls} value={fee.calculation_type} onChange={e=>setFee({...fee,calculation_type:e.target.value})}>{["fixed","percentage","per_night","per_guest","per_booking","per_room"].map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
          <label className={field}>Amount<Input required type="number" min="0" step="0.0001" value={fee.amount} onChange={e=>setFee({...fee,amount:e.target.value})}/></label>
          <label className={field}>Currency<Input maxLength={3} value={fee.currency} onChange={e=>setFee({...fee,currency:e.target.value.toUpperCase()})} placeholder={data?.property.currency}/></label>
          <label className={field}>Applies to<select multiple className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={fee.applies_to} onChange={e=>setFee({...fee,applies_to:Array.from(e.target.selectedOptions).map(o=>o.value)})}><option value="accommodation">Accommodation</option><option value="extras">Extras</option></select></label>
          <label className={field}>Tax rules (empty = all applicable rules)<select multiple className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={fee.tax_rule_ids??[]} onChange={e=>setFee({...fee,tax_rule_ids:Array.from(e.target.selectedOptions).map(o=>o.value)})}>{(data?.taxes??[]).map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className={field}>Minimum amount<Input type="number" min="0" step="0.01" value={fee.minimum_amount} onChange={e=>setFee({...fee,minimum_amount:e.target.value})}/></label>
          <label className={field}>Maximum amount<Input type="number" min="0" step="0.01" value={fee.maximum_amount} onChange={e=>setFee({...fee,maximum_amount:e.target.value})}/></label>
          <label className={field}>Priority<Input type="number" min="0" value={fee.priority} onChange={e=>setFee({...fee,priority:e.target.value})}/></label>
          <label className={field}>Effective from<Input type="date" value={fee.valid_from} onChange={e=>setFee({...fee,valid_from:e.target.value})}/></label>
          <label className={field}>Effective to<Input type="date" value={fee.valid_to} onChange={e=>setFee({...fee,valid_to:e.target.value})}/></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fee.taxable} onChange={e=>setFee({...fee,taxable:e.target.checked})}/> Taxable</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fee.active} onChange={e=>setFee({...fee,active:e.target.checked})}/> Active</label>
          <div className="flex gap-2 md:col-span-3"><Button type="submit" disabled={feeSave.isPending||!fee.code||!fee.name||fee.amount===""}>{feeSave.isPending?"Saving…":fee.id?"Update fee rule":"Save fee rule"}</Button><Button type="button" variant="outline" onClick={()=>setFee(emptyFee())}>Clear</Button></div>
        </form>
      </SectionCard>
      <SectionCard title="Property fee rules"><div className="divide-y divide-border">{(data?.fees??[]).map((r:any)=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="font-medium text-sm">{r.name} <Badge variant={r.active?"default":"secondary"}>{r.active?"Active":"Inactive"}</Badge></div><p className="text-xs text-muted-foreground">{r.code} · {r.calculation_type} · {r.amount} {r.currency||data?.property.currency} · {r.taxable?"taxable":"not taxable"}</p></div><Button size="sm" variant="outline" onClick={()=>setFee({...r,amount:String(r.amount),priority:String(r.priority),minimum_amount:r.minimum_amount==null?"":String(r.minimum_amount),maximum_amount:r.maximum_amount==null?"":String(r.maximum_amount),currency:r.currency||"",valid_from:r.valid_from||"",valid_to:r.valid_to||""})}>Edit</Button></div>)}{!data?.fees?.length&&<p className="py-4 text-sm text-muted-foreground">No fee rules configured.</p>}</div></SectionCard>
    </>}
    {tab==="promo" && <>
      <SectionCard title={promo.id?"Edit promotion":"Create promotion"} description="Promotions are validated against property, room, rate plan, booking window, stay dates, minimums and usage limits. One promotion is applied per booking in this release; stacking is disabled.">
        <form className="grid gap-4 md:grid-cols-3" onSubmit={e=>{e.preventDefault();promoSave.mutate();}}>
          <label className={field}>Promotion code (blank for auto-apply)<Input value={promo.code} onChange={e=>setPromo({...promo,code:e.target.value.toUpperCase()})}/></label>
          <label className={field}>Name<Input required value={promo.name} onChange={e=>setPromo({...promo,name:e.target.value})}/></label>
          <label className={field}>Discount type<select className={selectCls} value={promo.discount_type} onChange={e=>setPromo({...promo,discount_type:e.target.value})}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
          <label className={field}>Discount value<Input required type="number" min="0.0001" step="0.0001" value={promo.discount_value} onChange={e=>setPromo({...promo,discount_value:e.target.value})}/></label>
          <label className={field}>Currency<Input maxLength={3} value={promo.currency} onChange={e=>setPromo({...promo,currency:e.target.value.toUpperCase()})} placeholder={data?.property.currency}/></label>
          <label className={field}>Minimum nights<Input type="number" min="1" value={promo.minimum_nights} onChange={e=>setPromo({...promo,minimum_nights:e.target.value})}/></label>
          <label className={field}>Minimum booking value<Input type="number" min="0" step="0.01" value={promo.minimum_booking_value} onChange={e=>setPromo({...promo,minimum_booking_value:e.target.value})}/></label>
          <label className={field}>Eligible rooms (empty = all rooms)<select multiple className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={promo.eligible_room_ids??[]} onChange={e=>setPromo({...promo,eligible_room_ids:Array.from(e.target.selectedOptions).map(o=>o.value)})}>{(data?.rooms??[]).map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className={field}>Eligible rate plans (empty = all plans)<select multiple className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={promo.eligible_rate_plan_ids??[]} onChange={e=>setPromo({...promo,eligible_rate_plan_ids:Array.from(e.target.selectedOptions).map(o=>o.value)})}>{(data?.ratePlans??[]).map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className={field}>Usage limit<Input type="number" min="1" value={promo.usage_limit} onChange={e=>setPromo({...promo,usage_limit:e.target.value})}/></label>
          <label className={field}>Per-guest limit<Input type="number" min="1" value={promo.per_guest_limit} onChange={e=>setPromo({...promo,per_guest_limit:e.target.value})}/></label>
          <label className={field}>Booking valid from<Input type="datetime-local" value={promo.valid_from} onChange={e=>setPromo({...promo,valid_from:e.target.value})}/></label>
          <label className={field}>Booking valid to<Input type="datetime-local" value={promo.valid_to} onChange={e=>setPromo({...promo,valid_to:e.target.value})}/></label>
          <label className={field}>Stay from<Input type="date" value={promo.stay_from} onChange={e=>setPromo({...promo,stay_from:e.target.value})}/></label>
          <label className={field}>Stay to<Input type="date" value={promo.stay_to} onChange={e=>setPromo({...promo,stay_to:e.target.value})}/></label>
          <label className={field}>Booking window from<Input type="date" value={promo.booking_window_from} onChange={e=>setPromo({...promo,booking_window_from:e.target.value})}/></label>
          <label className={field}>Booking window to<Input type="date" value={promo.booking_window_to} onChange={e=>setPromo({...promo,booking_window_to:e.target.value})}/></label>
          <label className={field}>Priority<Input type="number" min="0" value={promo.priority} onChange={e=>setPromo({...promo,priority:e.target.value})}/></label>
          <label className={field}>Status<select className={selectCls} value={promo.status} onChange={e=>setPromo({...promo,status:e.target.value})}>{["draft","scheduled","active","suspended","revoked"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={promo.auto_apply} onChange={e=>setPromo({...promo,auto_apply:e.target.checked})}/> Automatically apply when eligible</label>
          <div className="flex gap-2 md:col-span-3"><Button type="submit" disabled={promoSave.isPending||!promo.name||!promo.discount_value}>{promoSave.isPending?"Saving…":promo.id?"Update promotion":"Save promotion"}</Button><Button type="button" variant="outline" onClick={()=>setPromo(emptyPromo())}>Clear</Button></div>
        </form>
      </SectionCard>
      <SectionCard title="Property promotions"><div className="divide-y divide-border">{(data?.promotions??[]).map((r:any)=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="font-medium text-sm">{r.name} <Badge variant={r.status==="active"?"default":"secondary"}>{r.status}</Badge></div><p className="text-xs text-muted-foreground">{r.code||"Automatic"} · {r.discount_type} {r.discount_value} · used {r.usage_count}{r.usage_limit?"/"+r.usage_limit:""} · priority {r.priority}</p></div><Button size="sm" variant="outline" onClick={()=>setPromo({...r,discount_value:String(r.discount_value),minimum_nights:String(r.minimum_nights),minimum_booking_value:String(r.minimum_booking_value),priority:String(r.priority),usage_limit:r.usage_limit==null?"":String(r.usage_limit),per_guest_limit:r.per_guest_limit==null?"":String(r.per_guest_limit),valid_from:r.valid_from?new Date(r.valid_from).toISOString().slice(0,16):"",valid_to:r.valid_to?new Date(r.valid_to).toISOString().slice(0,16):"",booking_window_from:r.booking_window_from||"",booking_window_to:r.booking_window_to||"",stay_from:r.stay_from||"",stay_to:r.stay_to||"",currency:r.currency||""})}>Edit</Button></div>)}{!data?.promotions?.length&&<p className="py-4 text-sm text-muted-foreground">No promotions configured.</p>}</div></SectionCard>
    </>}
    {tab==="audit" && <SectionCard title="Pricing configuration audit" description="Append-only before/after evidence for tax, fee and promotion configuration changes."><div className="space-y-3">{(data?.audit??[]).map((r:any)=><div key={r.id} className="rounded-md border border-border p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{r.entity_type} · {r.operation}</strong><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span></div><p className="mt-1 text-xs text-muted-foreground">Version {r.previous_version??"—"} → {r.new_version??"—"} · {r.entity_id}</p></div>)}{!data?.audit?.length&&<p className="text-sm text-muted-foreground">No pricing configuration changes recorded.</p>}</div></SectionCard>}
  </div>;
}
