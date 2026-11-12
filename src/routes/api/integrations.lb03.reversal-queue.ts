import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route=createFileRoute("/api/integrations/lb03/reversal-queue")({
 server:{handlers:{GET:async({request})=>{
  try{
   const auth=request.headers.get("authorization")??"";
   const match=/^Bearer\\s+(.+)$/i.exec(auth);
   if(!match)return Response.json({error:"unauthorized"},{status:401});
   const url=process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL;
   const key=process.env.SUPABASE_PUBLISHABLE_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)return Response.json({error:"configuration_unavailable"},{status:503});
   const client=createClient<Database>(url,key,{global:{headers:{Authorization:"Bearer "+match[1]}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const {data:user,error:userError}=await client.auth.getUser(match[1]);
   if(userError||!user.user)return Response.json({error:"unauthorized"},{status:401});
   const rpcClient=client as unknown as {rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>};
   const {data,error}=await rpcClient.rpc("lb03_list_pending_room_charge_reversals",{});
   if(error)return Response.json({error:"approval_queue_unavailable"},{status:403});
   return Response.json({requests:data??[]},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"approval_queue_unavailable"},{status:500});}
 }}}
});
