import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

// Contracts from the existing HK migrations; this does not apply those migrations.
type HousekeepingFunctions = {
  housekeeping_transition_room_state: { Args: { _room_state_id: string | null; _to_state: Database["public"]["Enums"]["room_state"]; _note?: string | null; _idempotency_key?: string | null }; Returns: Database["public"]["Tables"]["room_states"]["Row"] };
  housekeeping_list_work: { Args: { _mine_only?: boolean | null; _include_completed?: boolean | null }; Returns: { id: string | null; room_state_id: string | null; unit_label: string | null; room_id: string | null; room_name: string | null; booking_id: string | null; booking_reference: string | null; guest_name: string | null; status: Database["public"]["Enums"]["ops_task_status"] | null; priority: number | null; due_at: string | null; assignee_id: string | null; claimed_at: string | null; started_at: string | null; completed_at: string | null; title: string | null; description: string | null }[] };
  housekeeping_assign_task: { Args: { _task_id: string | null; _assignee_id: string }; Returns: Database["public"]["Tables"]["ops_tasks"]["Row"] };
  housekeeping_claim_task: { Args: { _task_id: string | null; _idempotency_key?: string | null }; Returns: Database["public"]["Tables"]["ops_tasks"]["Row"] };
  housekeeping_start_task: { Args: { _task_id: string | null; _idempotency_key?: string | null }; Returns: Database["public"]["Tables"]["ops_tasks"]["Row"] };
  housekeeping_complete_task: { Args: { _task_id: string | null; _note?: string | null; _idempotency_key?: string | null }; Returns: Database["public"]["Tables"]["ops_tasks"]["Row"] };
  housekeeping_list_staff: { Args: {  }; Returns: { user_id: string | null; email: string | null }[] };
  housekeeping_list_inspection_queue: { Args: {  }; Returns: { inspection_id: string | null; room_state_id: string | null; cleaning_task_id: string | null; attempt_no: number | null; status: string | null; unit_label: string | null; room_name: string | null; room_id: string | null; booking_id: string | null; booking_reference: string | null; guest_name: string | null; completed_at: string | null; checklist: Json | null; notes: string | null }[] };
  housekeeping_submit_inspection: { Args: { _inspection_id: string; _checklist: Json; _passed: boolean; _notes?: string | null; _idempotency_key?: string | null }; Returns: Json };
  housekeeping_report_exception: { Args: { _room_state_id: string | null; _task_id: string | null; _exception_type: string; _title: string; _notes?: string | null; _severity?: number | null; _evidence?: Json | null }; Returns: Json };
  housekeeping_list_exceptions: { Args: { _room_state_id?: string | null; _open_only?: boolean | null }; Returns: { id: string | null; room_state_id: string | null; task_id: string | null; exception_type: string | null; status: string | null; severity: number | null; title: string | null; notes: string | null; evidence: Json | null; reported_by: string | null; assigned_to: string | null; resolved_by: string | null; resolved_at: string | null; created_at: string | null; unit_label: string | null; room_name: string | null }[] };
  housekeeping_resolve_exception: { Args: { _exception_id: string; _resolution?: string | null }; Returns: Json };
  housekeeping_get_dashboard: { Args: {  }; Returns: { active_tasks: number | null; unassigned_tasks: number | null; in_progress_tasks: number | null; overdue_tasks: number | null; inspection_pending: number | null; exceptions_open: number | null; rooms_ready: number | null; failed_inspections_today: number | null; avg_cleaning_minutes: number | null }[] };
  housekeeping_list_notifications: { Args: { _limit?: number | null }; Returns: { id: string | null; event_id: string | null; kind: string | null; title: string | null; body: string | null; href: string | null; read_at: string | null; created_at: string | null }[] };
  housekeeping_mark_notification_read: { Args: { _id: string }; Returns: Json };
  housekeeping_list_intelligence: { Args: {  }; Returns: { signal_type: string | null; priority: string | null; title: string | null; reasoning: string | null; room_id: string | null; booking_id: string | null; confidence: number | null }[] };
};
type HousekeepingDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & HousekeepingFunctions;
  };
};

export function housekeepingClient(client: SupabaseClient<Database>) {
  return client as SupabaseClient<HousekeepingDatabase>;
}
