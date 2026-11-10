import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateLb01ServiceRequest } from "@/domains/integrations/lb01.credentials.server";

const schema=z.object({idempotencyKey:z.string().min(8).max(200),posTransactionId:z.string().uuid()}).strict();
type Admin={from(table:string):any};
export const Route=createFileRoute("/api/integrations/lb03/status")({
 server:{handlers:{POST:async({request})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as unknown as Admin;
  try{
   const {connection}=await authenticateLb01ServiceRequest(admin,request);
   if(connection.remote_product!=="lexibite"||connection.status!=="active"
    ||connection.local_approved_at==null||connection.remote_approved_at==null)
    return Response.json({error:"connection_not_active"},{status:403});
   const body=schema.parse(await request.json());
   const {data:operation,error}=await admin.from("lb03_room_charge_operations")
    .select("id,state,authorization_reference,expires_at,posting_id,posting_reference,amount,currency,reversed_amount,reversal_reference")
    .eq("connection_id",connection.id).eq("idempotency_key",body.idempotencyKey)
    .eq("pos_transaction_id",body.posTransactionId).maybeSingle();
   if(error) return Response.json({error:"status_unavailable"},{status:503});
   if(!operation) return Response.json({status:"NOT_FOUND"},{status:200,headers:{"Cache-Control":"no-store"}});
   const postingResult=await admin.from("pms_folio_postings")
    .select("id,status,posting_reference,folio_reference,amount,currency,posted_at")
    .eq("source_system","lexibite").eq("source_tenant_id",connection.remote_tenant_id)
    .eq("source_property_id",connection.remote_property_id).eq("source_order_id",body.posTransactionId);
   if(postingResult.error)return Response.json({error:"folio_status_unavailable"},{status:503});
   const postings=Array.isArray(postingResult.data)?postingResult.data:[];
   if(postings.length>1)return Response.json({status:"DUPLICATE_POSTING",postings,amount:operation.amount,
    currency:operation.currency,reversedAmount:operation.reversed_amount,reversalReference:operation.reversal_reference},
    {headers:{"Cache-Control":"no-store"}});
   const posting=postings[0]??null;
   const postingMatches=posting&&operation.posting_id===posting.id&&posting.status==="posted";
   const status=operation.state==="POSTED"||operation.state==="PARTIALLY_REVERSED"||operation.state==="REVERSED"
    ? (postingMatches?operation.state:"RECONCILIATION_REQUIRED")
    : (operation.state==="AUTHORIZED"&&posting?"RECONCILIATION_REQUIRED":operation.state);
   return Response.json({status,authorizationReference:operation.authorization_reference,
    expiresAt:operation.expires_at,posting:posting??null,amount:operation.amount,currency:operation.currency,
    reversedAmount:operation.reversed_amount,reversalReference:operation.reversal_reference},
    {headers:{"Cache-Control":"no-store"}});
  }catch(error){
   const message=error instanceof Error?error.message:"invalid_request";
   const denied=message.includes("Unauthorized")||message.includes("Replay");
   return Response.json({error:denied?"unauthorized":"invalid_request"},{status:denied?401:400});
  }
 }}}
});
