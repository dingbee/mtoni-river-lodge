import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateLb01ServiceRequest } from "@/domains/integrations/lb01.credentials.server";

const schema=z.object({
 authorizationReference:z.string().min(8).max(128),
 idempotencyKey:z.string().min(8).max(200),
 description:z.string().max(240).optional(),
}).strict();
type Admin={rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:{message?:string}|null}>};

export const Route=createFileRoute("/api/integrations/lb03/post")({
 server:{handlers:{POST:async({request})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as unknown as Admin;
  try{
   const {connection}=await authenticateLb01ServiceRequest(admin,request);
   if(connection.remote_product!=="lexibite"||connection.status!=="active"
     ||connection.local_approved_at==null||connection.remote_approved_at==null)
    return Response.json({error:"connection_not_active"},{status:403});
   const body=schema.parse(await request.json());
   const {data,error}=await admin.rpc("lb03_post_room_charge",{
    _connection_id:connection.id,_authorization_reference:body.authorizationReference,
    _idempotency_key:body.idempotencyKey,_description:body.description??"LexiBite POS room charge"
   });
   if(error) return Response.json({error:"posting_not_confirmed",detail:error.message},{status:409});
   return Response.json(data,{status:200,headers:{"Cache-Control":"no-store"}});
  }catch(error){
   const message=error instanceof Error?error.message:"invalid_request";
   const denied=message.includes("Unauthorized")||message.includes("Replay");
   return Response.json({error:denied?"unauthorized":"invalid_request"},{status:denied?401:400});
  }
 }}}
});
