import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Folders ----------

export const listMediaFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("media_folders")
      .select("*")
      .order("path");
    if (error) throw error;
    return data ?? [];
  });

export const createMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; parentId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    let path = "/" + data.name.trim().replace(/^\/+|\/+$/g, "");
    if (data.parentId) {
      const { data: parent, error: e1 } = await context.supabase
        .from("media_folders").select("path").eq("id", data.parentId).maybeSingle();
      if (e1) throw e1;
      if (parent) path = `${parent.path === "/" ? "" : parent.path}/${data.name.trim()}`;
    }
    const { data: row, error } = await context.supabase
      .from("media_folders")
      .insert({ name: data.name.trim(), parent_id: data.parentId ?? null, path })
      .select("*").single();
    if (error) throw error;
    return row;
  });

export const renameMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("media_folders").update({ name: data.name.trim() }).eq("id", data.id)
      .select("*").single();
    if (error) throw error;
    return row;
  });

export const deleteMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { count, error: e1 } = await context.supabase
      .from("media_assets").select("id", { count: "exact", head: true }).eq("folder_id", data.id);
    if (e1) throw e1;
    if ((count ?? 0) > 0) throw new Error("Folder is not empty");
    const { error } = await context.supabase.from("media_folders").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Assets ----------

export interface MediaAssetInput {
  filename: string;
  url: string;
  content_hash?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  alt_text?: string | null;
  caption?: string | null;
  folder_id?: string | null;
  tags?: string[] | null;
}

export const listMediaAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { folderId?: string | null; search?: string }) => input)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("media_assets").select("*").order("created_at", { ascending: false });
    if (data.folderId === null) q = q.is("folder_id", null);
    else if (data.folderId) q = q.eq("folder_id", data.folderId);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`filename.ilike.${s},alt_text.ilike.${s},caption.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const findDuplicateByHash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { hash: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("media_assets").select("*").eq("content_hash", data.hash).maybeSingle();
    if (error) throw error;
    return row;
  });

export const createMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MediaAssetInput) => input)
  .handler(async ({ data, context }) => {
    const payload = { ...data, uploaded_by: context.userId };
    const { data: row, error } = await context.supabase
      .from("media_assets").insert(payload).select("*").single();
    if (error) throw error;
    return row;
  });

export const updateMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; patch: Partial<MediaAssetInput> }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("media_assets").update(data.patch).eq("id", data.id).select("*").single();
    if (error) throw error;
    return row;
  });

export const bulkRenameMediaAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; prefix?: string; suffix?: string; replace?: { from: string; to: string } }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("media_assets").select("id, filename").in("id", data.ids);
    if (error) throw error;
    const updates = (rows ?? []).map((r) => {
      let name = r.filename;
      if (data.replace) name = name.split(data.replace.from).join(data.replace.to);
      if (data.prefix) name = `${data.prefix}${name}`;
      if (data.suffix) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)}${data.suffix}${name.slice(dot)}` : `${name}${data.suffix}`;
      }
      return { id: r.id, filename: name };
    });
    for (const u of updates) {
      await context.supabase.from("media_assets").update({ filename: u.filename }).eq("id", u.id);
    }
    return { count: updates.length };
  });

export const getMediaUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assetId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("media_usage").select("*").eq("asset_id", data.assetId);
    if (error) throw error;
    return rows ?? [];
  });

export const deleteMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; storagePath?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { count, error: e1 } = await context.supabase
      .from("media_usage").select("id", { count: "exact", head: true }).eq("asset_id", data.id);
    if (e1) throw e1;
    if ((count ?? 0) > 0) {
      throw new Error(`Asset is in use (${count} reference${count === 1 ? "" : "s"}) — remove references before deleting.`);
    }
    if (data.storagePath) {
      await context.supabase.storage.from("media").remove([data.storagePath]);
    }
    const { error } = await context.supabase.from("media_assets").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const signMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string; expiresIn?: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("media").createSignedUrl(data.path, data.expiresIn ?? 60 * 60);
    if (error) throw error;
    return signed;
  });