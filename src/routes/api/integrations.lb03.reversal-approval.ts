import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("approve"),requestId:z.string().uuid()}).strict(),
 z.object({action:z.literal("reject"),requestId:z.string().uuid(),reason:z.string().min(3).max(500)}).strict()
]);
export const Route=createFileRoute("/api/integrations/lb03/reversal-approval")({
 server:{handlers:{POST:async({request})=>{
  try{
   const auth=request.headers.get("authorization")??"";
   const match=/^Bearer\s+(.+)$/i.exec(auth);
   if(!match)return Response.json({error:"unauthorized"},{status:401});
   const url=process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL;
   const key=process.env.SUPABASE_PUBLISHABLE_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)return Response.json({error:"configuration_unavailable"},{status:503});
   const userDb=createClient<Database>(url,key,{global:{headers:{Authorization:"Bearer "+match[1]}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const {data,error}=await userDb.auth.getUser(match[1]);
   if(error||!data.user)return Response.json({error:"unauthorized"},{status:401});
   const body=schema.parse(await request.json());
   const result=body.action==="approve"
    ? await userDb.rpc("lb03_approve_room_charge_reversal",{_request_id:body.requestId})
    : await userDb.rpc("lb03_reject_room_charge_reversal",{_request_id:body.requestId,_reason:body.reason});
   if(result.error)return Response.json({error:"reversal_decision_rejected"},{status:403});
   return Response.json({result:result.data},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
   return Response.json({error:error instanceof z.ZodError?"invalid_request":"reversal_decision_failed"},{status:400});
  }
 }}}
});
