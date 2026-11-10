import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateLb01ServiceRequest } from "@/domains/integrations/lb01.credentials.server";

const schema = z.object({
 requestId:z.string().uuid(), idempotencyKey:z.string().min(8).max(200),
 posTransactionId:z.string().uuid(), posTenantId:z.string().uuid(),
 posPropertyId:z.string().uuid(), integrationPropertyId:z.string().uuid(),
 outletReference:z.string().uuid(), guestReference:z.string().uuid(), stayReference:z.string().uuid(),
 currency:z.string().regex(/^[A-Z]{3}$/), amount:z.number().positive().finite(),
 taxBreakdown:z.array(z.record(z.string(),z.unknown())).default([]),
 serviceCharge:z.number().nonnegative().default(0), discountAmount:z.number().nonnegative().default(0),
 correlationId:z.string().min(8).max(128),
}).strict();

type Admin = {
 rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>;
};

export const Route = createFileRoute("/api/integrations/lb03/authorize")({
 server:{handlers:{POST:async({request})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as unknown as Admin;
  try {
   const {connection}=await authenticateLb01ServiceRequest(admin,request);
   if(connection.remote_product!=="lexibite"||connection.status!=="active"
     ||connection.local_approved_at==null||connection.remote_approved_at==null)
    return Response.json({error:"connection_not_active"},{status:403});
   const body=schema.parse(await request.json());
   if(body.posTenantId!==connection.remote_tenant_id
     ||body.posPropertyId!==connection.remote_property_id
     ||body.integrationPropertyId!==connection.integration_property_id
     ||body.correlationId!==connection.correlation_id)
    return Response.json({error:"connection_scope_mismatch"},{status:403});
   const {data,error}=await admin.rpc("lb03_authorize_room_charge",{
    _connection_id:connection.id,_request_id:body.requestId,_idempotency_key:body.idempotencyKey,
    _pos_transaction_id:body.posTransactionId,_pos_tenant_id:body.posTenantId,
    _pos_property_id:body.posPropertyId,_integration_property_id:body.integrationPropertyId,
    _outlet_reference:body.outletReference,_guest_reference:body.guestReference,
    _stay_reference:body.stayReference,_currency:body.currency,_amount:body.amount,
    _tax_breakdown:body.taxBreakdown,_service_charge:body.serviceCharge,
    _discount_amount:body.discountAmount,_correlation_id:body.correlationId
   });
   if(error) return Response.json({error:"authorization_rejected",detail:error.message},{status:422});
   return Response.json(data,{status:200,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
   const message=error instanceof Error?error.message:"invalid_request";
   return Response.json({error:message.includes("Unauthorized")||message.includes("Replay")?"unauthorized":"invalid_request"},{status:message.includes("Unauthorized")||message.includes("Replay")?401:400});
  }
 }}}
});
