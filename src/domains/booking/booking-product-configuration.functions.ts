/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase booking configuration tables are not yet in generated database types. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const uuid = z.string().uuid();
const slug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const configInput = z.object({
  id: uuid.optional(),
  roomId: uuid,
  publicationId: uuid,
  channel: z.enum(["permanent", "campaign"]),
  campaignSlug: slug.nullable().optional(),
  displayOrder: z.number().int().min(0).max(10000).default(100),
  publicVisible: z.boolean().default(false),
  offerCode: z.string().trim().min(2).max(64).optional(),
  offerName: z.string().trim().min(2).max(160).optional(),
  offerDescription: z.string().trim().max(1000).optional(),
  bookingStartsAt: z.string().datetime().nullable().optional(),
  bookingEndsAt: z.string().datetime().nullable().optional(),
  stayStartsOn: z.string().date().nullable().optional(),
  stayEndsOn: z.string().date().nullable().optional(),
  minimumStay: z.number().int().min(1).max(365).nullable().optional(),
  maximumStay: z.number().int().min(1).max(365).nullable().optional(),
  guestEligibility: z.record(z.string(), z.unknown()).default({}),
  inclusions: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  exclusions: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  termsAndConditions: z.string().trim().max(5000).optional(),
}).superRefine((v, ctx) => {
  if (v.channel === "permanent" && v.campaignSlug) ctx.addIssue({code:"custom",path:["campaignSlug"],message:"Permanent booking products cannot have a campaign slug."});
  if (v.channel === "campaign" && (!v.campaignSlug || !v.offerCode || !v.offerName)) ctx.addIssue({code:"custom",path:["offerName"],message:"Campaign products require a campaign slug, offer code and offer name."});
  if (v.bookingStartsAt && v.bookingEndsAt && v.bookingEndsAt <= v.bookingStartsAt) ctx.addIssue({code:"custom",path:["bookingEndsAt"],message:"Booking end must follow booking start."});
  if (v.stayStartsOn && v.stayEndsOn && v.stayEndsOn < v.stayStartsOn) ctx.addIssue({code:"custom",path:["stayEndsOn"],message:"Stay end must not precede stay start."});
  if (v.minimumStay && v.maximumStay && v.maximumStay < v.minimumStay) ctx.addIssue({code:"custom",path:["maximumStay"],message:"Maximum stay must be at least minimum stay."});
});

async function propertyContext(context: any) {
  await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
  const {data: propertyId,error:activeError}=await context.supabase.rpc("staynas_active_property_id",{_uid:context.userId});
  if(activeError||!propertyId) throw new Error("An active property context is required.");
  const {data:allowed,error:accessError}=await context.supabase.rpc("staynas_user_has_property_access",{_uid:context.userId,_property_id:propertyId});
  if(accessError||!allowed) throw new Error("Property access denied.");
  const {data:property,error}=await context.supabase.from("staynas_properties").select("id,currency,timezone").eq("id",propertyId).single();
  if(error||!property||!/^[A-Z]{3}$/.test(String(property.currency??"").toUpperCase())) throw new Error("The property must have an explicit ISO currency.");
  return {propertyId,property};
}

export const listBookingProductConfiguration = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const {propertyId,property}=await propertyContext(context);
    const sb=context.supabase as any;
    const [{data:rooms,error:roomError},{data:publications,error:publicationError},{data:configurations,error:configError}]=await Promise.all([
      sb.from("rooms").select("id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,status,catalogue_type_id,sort_order").eq("property_id",propertyId).eq("status","active").order("sort_order"),
      sb.from("staynas_rate_plan_publications").select("id,rate_plan_id,publication_number,rate_plan_version,code,name,currency,effective_from,effective_to,snapshot_hash,room_type_assignments,resolved_data").eq("property_id",propertyId).order("published_at",{ascending:false}),
      sb.from("staynas_booking_product_configurations").select("*").eq("property_id",propertyId).order("display_order"),
    ]);
    if(roomError||publicationError||configError) throw new Error("Booking product configuration could not be loaded.");
    const {data:plans,error:planError}=await sb.from("staynas_rate_plans").select("id,code,name,currency,publication_status,active,meal_plan,refundable").eq("property_id",propertyId).eq("publication_status","published").eq("active",true);
    if(planError) throw new Error("Published rate plans could not be loaded.");
    const latest=new Map<string,number>();
    for(const p of publications??[]) latest.set(p.rate_plan_id,Math.max(latest.get(p.rate_plan_id)??0,Number(p.publication_number)));
    const activePlans=new Set((plans??[]).map((p:any)=>p.id));
    const eligible=(publications??[]).filter((p:any)=>activePlans.has(p.rate_plan_id)&&Number(p.publication_number)===latest.get(p.rate_plan_id)&&p.currency===property.currency);
    return {property,rooms:rooms??[],publications:eligible,plans:plans??[],configurations:configurations??[]};
  });

export const saveBookingProductConfiguration = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((value:unknown)=>configInput.parse(value))
  .handler(async({data,context})=>{
    const {propertyId,property}=await propertyContext(context);
    const sb=context.supabase as any;
    const [{data:room,error:roomError},{data:publication,error:publicationError}]=await Promise.all([
      sb.from("rooms").select("id,catalogue_type_id,max_occupancy,status").eq("id",data.roomId).eq("property_id",propertyId).eq("status","active").maybeSingle(),
      sb.from("staynas_rate_plan_publications").select("id,rate_plan_id,currency,room_type_assignments,publication_number").eq("id",data.publicationId).eq("property_id",propertyId).maybeSingle(),
    ]);
    if(roomError||!room) throw new Error("Selected room does not belong to the active property.");
    if(publicationError||!publication||publication.currency!==property.currency) throw new Error("Selected rate snapshot is not valid for this property's configured currency.");
    const {data:latest,error:latestError}=await sb.from("staynas_rate_plan_publications").select("id,publication_number").eq("property_id",propertyId).eq("rate_plan_id",publication.rate_plan_id).order("publication_number",{ascending:false}).limit(1).maybeSingle();
    if(latestError||latest?.id!==publication.id) throw new Error("Only the latest published rate-plan snapshot can be selected.");
    const assignments=Array.isArray(publication.room_type_assignments)?publication.room_type_assignments:[];
    if(!assignments.some((x:any)=>x.room_type_id===room.catalogue_type_id)) throw new Error("The selected published rate plan is not assigned to this room type.");
    const payload={
      property_id:propertyId,room_id:data.roomId,rate_plan_publication_id:data.publicationId,
      channel:data.channel,campaign_slug:data.channel==="campaign"?data.campaignSlug:null,
      display_order:data.displayOrder,public_visible:data.publicVisible,
      offer_code:data.channel==="campaign"?data.offerCode:null,offer_name:data.channel==="campaign"?data.offerName:null,
      offer_description:data.offerDescription??null,booking_starts_at:data.bookingStartsAt??null,
      booking_ends_at:data.bookingEndsAt??null,stay_starts_on:data.stayStartsOn??null,stay_ends_on:data.stayEndsOn??null,
      minimum_stay:data.minimumStay??null,maximum_stay:data.maximumStay??null,
      guest_eligibility:data.guestEligibility,inclusions:data.inclusions,exclusions:data.exclusions,
      terms_and_conditions:data.termsAndConditions??null,publication_status:"draft",updated_by:context.userId,
    };
    let query=sb.from("staynas_booking_product_configurations");
    if(data.id) query=query.update(payload).eq("id",data.id).eq("property_id",propertyId);
    else query=query.insert({...payload,created_by:context.userId});
    const {data:row,error}=await query.select("*").single();
    if(error||!row) throw new Error(error?.message??"Booking product configuration could not be saved.");
    return row;
  });

export const publishBookingProductConfiguration = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((value:unknown)=>z.object({id:uuid}).parse(value))
  .handler(async({data,context})=>{
    const {propertyId}=await propertyContext(context);
    const {data:row,error}=await (context.supabase as any).from("staynas_booking_product_configurations")
      .update({publication_status:"published",public_visible:true,published_at:new Date().toISOString(),published_by:context.userId,updated_by:context.userId})
      .eq("id",data.id).eq("property_id",propertyId).select("id,configuration_version,publication_status,public_visible,published_at").single();
    if(error||!row) throw new Error(error?.message??"Booking product publication failed.");
    return row;
  });

export const getPublicBookingProducts = createServerFn({method:"GET"})
  .inputValidator((value:unknown)=>z.object({propertyId:uuid,channel:z.enum(["permanent","campaign"]),campaignSlug:slug.optional()}).parse(value))
  .handler(async({data})=>{
    if(data.channel==="campaign"&&!data.campaignSlug) throw new Error("Campaign slug is required.");
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const sb=supabaseAdmin as any;
    const {data:property,error:propertyError}=await sb.from("staynas_properties").select("id,currency,status").eq("id",data.propertyId).maybeSingle();
    if(propertyError||!property||property.status!=="active"||!/^[A-Z]{3}$/.test(property.currency??"")) throw new Error("Booking property is unavailable or currency is not configured.");
    let query=sb.from("staynas_booking_product_configurations").select("id,room_id,rate_plan_publication_id,display_order,channel,campaign_slug,offer_code,offer_name,offer_description,booking_starts_at,booking_ends_at,stay_starts_on,stay_ends_on,minimum_stay,maximum_stay,guest_eligibility,inclusions,exclusions,terms_and_conditions,configuration_version").eq("property_id",data.propertyId).eq("channel",data.channel).eq("publication_status","published").eq("public_visible",true).order("display_order");
    if(data.channel==="campaign") query=query.eq("campaign_slug",data.campaignSlug);
    else query=query.is("campaign_slug",null);
    const {data:rows,error}=await query;
    if(error) throw new Error("Published booking products could not be resolved.");
    const roomIds=[...new Set((rows??[]).map((x:any)=>x.room_id))];
    const publicationIds=[...new Set((rows??[]).map((x:any)=>x.rate_plan_publication_id))];
    if(!roomIds.length||!publicationIds.length) return {currency:property.currency,products:[]};
    const [{data:rooms,error:roomsError},{data:publications,error:publicationsError}]=await Promise.all([
      sb.from("rooms").select("id,catalogue_type_id,status").eq("property_id",data.propertyId).in("id",roomIds),
      sb.from("staynas_rate_plan_publications").select("id,rate_plan_id,publication_number,currency,effective_from,effective_to,room_type_assignments").eq("property_id",data.propertyId).in("id",publicationIds),
    ]);
    if(roomsError||publicationsError) throw new Error("Published room and rate evidence could not be verified.");
    const roomById=new Map((rooms??[]).map((x:any)=>[x.id,x]));
    const publicationById=new Map((publications??[]).map((x:any)=>[x.id,x]));
    const planIds=[...new Set((publications??[]).map((x:any)=>x.rate_plan_id))];
    const [{data:plans,error:plansError},{data:latestRows,error:latestError}]=await Promise.all([
      sb.from("staynas_rate_plans").select("id,active,publication_status,currency").eq("property_id",data.propertyId).in("id",planIds),
      sb.from("staynas_rate_plan_publications").select("id,rate_plan_id,publication_number").eq("property_id",data.propertyId).in("rate_plan_id",planIds).order("publication_number",{ascending:false}),
    ]);
    if(plansError||latestError) throw new Error("Current published rate-plan status could not be verified.");
    const activePlanIds=new Set((plans??[]).filter((x:any)=>x.active&&x.publication_status==="published"&&x.currency===property.currency).map((x:any)=>x.id));
    const latestByPlan=new Map<string,string>();
    for(const p of latestRows??[]) if(!latestByPlan.has(p.rate_plan_id)) latestByPlan.set(p.rate_plan_id,p.id);
    const products=(rows??[]).filter((row:any)=>{
      const room:any=roomById.get(row.room_id);
      const publication:any=publicationById.get(row.rate_plan_publication_id);
      if(!room||room.status!=="active"||!publication||publication.currency!==property.currency) return false;
      if(!activePlanIds.has(publication.rate_plan_id)||latestByPlan.get(publication.rate_plan_id)!==publication.id) return false;
      const assignments=Array.isArray(publication.room_type_assignments)?publication.room_type_assignments:[];
      return assignments.some((a:any)=>a.room_type_id===room.catalogue_type_id);
    });
    return {currency:property.currency,products};
  });
