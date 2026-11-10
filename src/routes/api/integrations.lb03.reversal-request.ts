import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateLb01ServiceRequest } from "@/domains/integrations/lb01.credentials.server";

const schema=z.object({
 postingReference:z.string().min(8).max(128),idempotencyKey:z.string().min(8).max(200),
 amount:z.number().positive().finite(),reasonCode:z.enum(["pos_void","incorrect_amount","duplicate_charge","guest_dispute","service_recovery","other"]),
 reason:z.string().min(3).max(500),
}).strict();
type Admin={rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>};
export const Route=createFileRoute("/api/integrations/lb03/reversal-request")({
 server:{handlers:{POST:async({request})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as unknown as Admin;
  try{
   const {connection}=await authenticateLb01ServiceRequest(admin,request);
   if(connection.remote_product!=="lexibite"||connection.status!=="active"
    ||connection.local_approved_at==null||connection.remote_approved_at==null)
    return Response.json({error:"connection_not_active"},{status:403});
   const body=schema.parse(await request.json());
   const {data,error}=await admin.rpc("lb03_request_room_charge_reversal",{
    _connection_id:connection.id,_posting_reference:body.postingReference,
    _idempotency_key:body.idempotencyKey,_amount:body.amount,
    _reason_code:body.reasonCode,_reason:body.reason
   });
   if(error)return Response.json({error:"reversal_request_rejected"},{status:409});
   return Response.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
   const message=error instanceof Error?error.message:"invalid_request";
   const denied=message.includes("Unauthorized")||message.includes("Replay");
   return Response.json({error:denied?"unauthorized":"invalid_request"},{status:denied?401:400});
  }
 }}}
});
