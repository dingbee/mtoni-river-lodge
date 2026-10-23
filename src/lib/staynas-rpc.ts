import type { SupabaseClient } from "@supabase/supabase-js";

// Local contracts for StayNas property RPCs defined in existing migrations
// but absent from the generated database types.
type Result<T> = Promise<{ data: T | null; error: { message: string } | null }>;

export interface StayNasPropertyRpc {
  rpc(fn: "staynas_current_property_role"): Result<string | null>;
  rpc(fn: "staynas_list_properties"): Result<Array<{ id: string; [k: string]: unknown }>>;
  rpc(fn: "staynas_set_active_property", args: { _property_id: string }): Result<unknown>;
}

export function staynasRpc(client: SupabaseClient<any>): StayNasPropertyRpc {
  return client as unknown as StayNasPropertyRpc;
}
