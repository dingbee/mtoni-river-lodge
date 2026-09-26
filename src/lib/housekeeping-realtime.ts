import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { eventBus } from "@/domains/_platform/events/bus";
export function useHousekeepingRealtime(enabled=true){
 const qc=useQueryClient();
 useEffect(()=>{if(!enabled)return;const refresh=()=>["housekeeping-work","housekeeping-inspection-queue","housekeeping-exceptions","housekeeping-dashboard","housekeeping-notifications","housekeeping-intelligence"].forEach(k=>void qc.invalidateQueries({queryKey:[k]}));
 const c=supabase.channel("staynas-housekeeping-realtime")
 .on("postgres_changes",{event:"*",schema:"public",table:"housekeeping_events"},p=>{const x:any=p.new;if(p.eventType==="INSERT"&&x?.event_type)eventBus.emit({id:x.id,at:x.created_at,type:({task_created:"task.created",task_assigned:"task.assigned",cleaning_completed:"task.completed",room_ready:"room.state_changed",exception_reported:"ops.alert_raised",exception_resolved:"ops.alert_resolved"} as any)[x.event_type]??"task.updated",userId:x.actor_id,module:"operations.housekeeping",entityType:"housekeeping",entityId:x.task_id??x.room_state_id??null,meta:{...x.payload,event_type:x.event_type},severity:x.event_type.includes("failed")||x.event_type.includes("maintenance")?"warn":"audit",correlationId:x.correlation_id});refresh();})
 .on("postgres_changes",{event:"*",schema:"public",table:"housekeeping_notifications"},refresh)
 .subscribe((s,e)=>{if(s==="CHANNEL_ERROR"||s==="TIMED_OUT")console.warn("[housekeeping-realtime] degraded",e);});
 return()=>{supabase.removeChannel(c)};},[enabled,qc]);
}