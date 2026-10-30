import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { getActivePropertyAiRoles } from "@/domains/ai/ai.authorization.server";

// ============= Types =============

export interface KbCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  allowed_roles: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KbDocument {
  id: string;
  category_id: string | null;
  slug: string;
  title: string;
  summary: string | null;
  source_type: "markdown" | "text" | "pdf" | "docx" | "url" | "html";
  source_url: string | null;
  storage_path: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  allowed_roles: string[] | null;
  current_version: number;
  byte_size: number | null;
  property_id: string;
  language_code: string;
  is_guest_visible: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
  category_slug?: string | null;
}

export interface KbSearchHit {
  source_id: string;
  source_kind: string;
  source_type: string;
  title: string;
  slug: string | null;
  category_slug: string | null;
  url: string | null;
  summary: string | null;
  content: string;
  language_code: string;
  source_updated_at: string | null;
  rank: number;
}

// ============= Helpers =============

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `doc-${Math.random().toString(36).slice(2, 8)}`;
}

function reviewDueAt(sourceType: string, now = new Date()): string {
  const days: Record<string, number> = { policy: 180, experience: 60, room: 30, url: 30, html: 30, pdf: 180, docx: 180 };
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + (days[sourceType] ?? 90));
  return due.toISOString();
}

/** Split content into ~1200-char chunks on paragraph boundaries with 150-char overlap. */
export function chunkText(text: string, maxLen = 1200, overlap = 150): string[] {
  const cleaned = text.replace(/\r\n?/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];
  const paras = cleaned.split(/\n\s*\n+/);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf.length + p.length + 2 <= maxLen) {
      buf = buf ? `${buf}\n\n${p}` : p;
    } else {
      if (buf) out.push(buf);
      if (p.length <= maxLen) {
        buf = p;
      } else {
        // hard-split long paragraph
        let i = 0;
        while (i < p.length) {
          const end = Math.min(i + maxLen, p.length);
          out.push(p.slice(i, end));
          i = end - overlap;
          if (i < 0) i = 0;
          if (end === p.length) break;
        }
        buf = "";
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}

async function requireKnowledgeProperty(supabase: any, userId: string, manage = false) {
  const scope = await getActivePropertyAiRoles(supabase, userId);
  const allowed = manage
    ? ["owner", "manager", "admin"]
    : ["owner", "manager", "admin", "reservations", "reception", "marketing", "finance", "housekeeping"];
  if (!scope.roles.some((role) => allowed.includes(role))) {
    throw new Error(manage ? "You do not have permission to manage property knowledge." : "You do not have access to property knowledge.");
  }
  return scope.propertyId;
}

// ============= Categories =============

export const listKbCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KbCategory[]> => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("knowledge_categories")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return (data ?? []) as KbCategory[];
  });

export const upsertKbCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    slug?: string;
    name: string;
    description?: string | null;
    parent_id?: string | null;
    allowed_roles?: string[];
    sort_order?: number;
  }) => {
    if (!input?.name?.trim()) throw new Error("Name is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId, true);
    const payload: any = {
      property_id: propertyId,
      name: data.name.trim(),
      description: data.description ?? null,
      parent_id: data.parent_id ?? null,
      allowed_roles: data.allowed_roles ?? [],
      sort_order: data.sort_order ?? 0,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("knowledge_categories")
        .update(payload)
        .eq("id", data.id)
        .eq("property_id", propertyId)
        .select()
        .maybeSingle();
      if (error) throw error;
      return row;
    }
    payload.slug = (data.slug ?? slugify(data.name));
    const { data: row, error } = await context.supabase
      .from("knowledge_categories")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const deleteKbCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId, true);
    const { error } = await context.supabase.from("knowledge_categories").delete().eq("id", data.id).eq("property_id", propertyId);
    if (error) throw error;
    return { ok: true };
  });

// ============= Documents =============

export const listKbDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { category_id?: string; status?: string; search?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<KbDocument[]> => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId);
    let q = context.supabase
      .from("knowledge_documents")
      .select("*, knowledge_categories(slug)")
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.category_id) q = q.eq("category_id", data.category_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      ...r,
      category_slug: r.knowledge_categories?.slug ?? null,
    })) as KbDocument[];
  });

export const getKbDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId);
    const [{ data: doc }, { data: versions }] = await Promise.all([
      context.supabase
        .from("knowledge_documents")
        .select("*, knowledge_categories(slug, name)")
        .eq("id", data.id)
        .eq("property_id", propertyId)
        .maybeSingle(),
      context.supabase
        .from("knowledge_document_versions")
        .select("id, version, byte_size, change_note, created_at, created_by")
        .eq("document_id", data.id)
        .eq("property_id", propertyId)
        .order("version", { ascending: false }),
    ]);
    if (!doc) throw new Error("Document not found or you do not have access.");
    const { data: current } = await context.supabase
      .from("knowledge_document_versions")
      .select("content_text")
      .eq("document_id", data.id)
      .eq("property_id", propertyId)
      .eq("version", (doc as any).current_version)
      .maybeSingle();
    return { document: doc, versions: versions ?? [], content: (current as any)?.content_text ?? "" };
  });

/**
 * Create or update a document. Whenever content_text is provided, a new
 * version is written and chunks are rebuilt.
 */
export const upsertKbDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    category_id?: string | null;
    slug?: string;
    title: string;
    summary?: string | null;
    source_type?: KbDocument["source_type"];
    source_url?: string | null;
    storage_path?: string | null;
    tags?: string[];
    status?: KbDocument["status"];
    allowed_roles?: string[] | null;
    language_code?: "en" | "sw";
    is_guest_visible?: boolean;
    content_text?: string | null;
    change_note?: string | null;
  }) => {
    if (!input?.title?.trim()) throw new Error("Title is required.");
    if (input.content_text != null && input.content_text.length > 500_000) {
      throw new Error("Document content is too large (max 500 KB).");
    }
    if (input.language_code && !["en", "sw"].includes(input.language_code)) {
      throw new Error("Knowledge language must be English (en) or Swahili (sw).");
    }
    if (input.is_guest_visible && (input.status ?? "draft") !== "published") {
      throw new Error("Only published documents can be made guest-visible.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId, true);
    const supabase = context.supabase;
    const now = new Date().toISOString();

    let docId = data.id;
    let currentVersion = 1;

    if (docId) {
      const { data: existing, error } = await supabase
        .from("knowledge_documents")
        .select("current_version")
        .eq("id", docId)
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error || !existing) throw new Error("Document not found.");
      currentVersion = (existing as any).current_version ?? 1;

      const patch: any = {
        title: data.title.trim(),
        summary: data.summary ?? null,
        category_id: data.category_id ?? null,
        source_type: data.source_type ?? "markdown",
        source_url: data.source_url ?? null,
        storage_path: data.storage_path ?? null,
        tags: data.tags ?? [],
        status: data.status ?? "draft",
        allowed_roles: data.allowed_roles ?? null,
        language_code: data.language_code ?? "en",
        is_guest_visible: data.is_guest_visible ?? false,
        source_updated_at: data.content_text != null ? now : undefined,
        review_due_at: data.content_text != null ? reviewDueAt(data.source_type ?? "markdown") : undefined,
        ...(data.status === "published" ? { reviewed_by: context.userId, reviewed_at: now } : {}),
        updated_by: context.userId,
        updated_at: now,
      };
      const { error: upErr } = await supabase.from("knowledge_documents").update(patch).eq("id", docId).eq("property_id", propertyId);
      if (upErr) throw upErr;
    } else {
      const slug = data.slug ?? slugify(data.title);
      const insertPayload: any = {
        slug,
        title: data.title.trim(),
        summary: data.summary ?? null,
        category_id: data.category_id ?? null,
        source_type: data.source_type ?? "markdown",
        source_url: data.source_url ?? null,
        storage_path: data.storage_path ?? null,
        tags: data.tags ?? [],
        status: data.status ?? "draft",
        allowed_roles: data.allowed_roles ?? null,
        property_id: propertyId,
        language_code: data.language_code ?? "en",
        is_guest_visible: data.is_guest_visible ?? false,
        source_updated_at: data.content_text != null ? now : null,
        review_due_at: data.content_text != null ? reviewDueAt(data.source_type ?? "markdown") : null,
        ...(data.status === "published" ? { reviewed_by: context.userId, reviewed_at: now } : {}),
        current_version: 1,
        byte_size: data.content_text?.length ?? 0,
        created_by: context.userId,
        updated_by: context.userId,
      };
      const { data: row, error } = await supabase
        .from("knowledge_documents")
        .insert(insertPayload)
        .select("id, current_version")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error || !row) throw error ?? new Error("Insert failed.");
      docId = (row as any).id;
      currentVersion = 1;
    }

    // If content provided, bump version and rebuild chunks
    if (docId && data.content_text != null) {
      const nextVersion = data.id ? currentVersion + 1 : 1;
      const content = data.content_text;

      const { error: vErr } = await supabase.from("knowledge_document_versions").insert({
        document_id: docId,
        property_id: propertyId,
        version: nextVersion,
        content_text: content,
        byte_size: content.length,
        change_note: data.change_note ?? null,
        created_by: context.userId,
      });
      if (vErr) throw vErr;

      // Delete old chunks and rebuild for the new current version
      const { error: deleteChunksError } = await supabase.from("knowledge_chunks").delete().eq("document_id", docId).eq("property_id", propertyId);
      if (deleteChunksError) throw deleteChunksError;
      const chunks = chunkText(content);
      if (chunks.length > 0) {
        const rows = chunks.map((c, i) => ({
          document_id: docId,
          property_id: propertyId,
          language_code: data.language_code ?? "en",
          version: nextVersion,
          chunk_index: i,
          content: c,
        }));
        const { error: cErr } = await supabase.from("knowledge_chunks").insert(rows);
        if (cErr) throw cErr;
      }

      await supabase
        .from("knowledge_documents")
        .update({ current_version: nextVersion, byte_size: content.length, updated_by: context.userId })
        .eq("id", docId)
        .eq("property_id", propertyId);
    }

    return { id: docId };
  });

export const deleteKbDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId, true);
    // best-effort storage cleanup
    const { data: doc } = await context.supabase
      .from("knowledge_documents")
      .select("storage_path")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    const path = (doc as any)?.storage_path as string | null | undefined;
    if (path) {
      await context.supabase.storage.from("knowledge-docs").remove([path]);
    }
    const { error } = await context.supabase.from("knowledge_documents").delete().eq("id", data.id).eq("property_id", propertyId);
    if (error) throw error;
    return { ok: true };
  });

/** Get a signed URL to download the raw source file, if any. */
export const getKbDocumentFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId);
    const { data: doc } = await context.supabase
      .from("knowledge_documents")
      .select("storage_path")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    const path = (doc as any)?.storage_path as string | null;
    if (!path) return { url: null };
    const { data: signed, error } = await context.supabase.storage
      .from("knowledge-docs")
      .createSignedUrl(path, 300);
    if (error) throw error;
    return { url: signed?.signedUrl ?? null };
  });

// ============= Search (also used by the AI tool) =============

export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string; limit?: number }) => {
    const q = String(input?.query ?? "").trim();
    if (!q) throw new Error("Query is required.");
    return { query: q, limit: Math.min(Math.max(input?.limit ?? 6, 1), 20) };
  })
  .handler(async ({ data, context }): Promise<KbSearchHit[]> => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await requireKnowledgeProperty(context.supabase, context.userId);
    if (process.env.STAYNAS_PROPERTY_KNOWLEDGE_SEARCH_ENABLED !== "true") {
      throw new Error("Property knowledge retrieval is disabled until database isolation verification is complete.");
    }
    const { data: rows, error } = await context.supabase.rpc("staynas_property_knowledge_search", {
      _property_id: propertyId,
      _query: data.query,
      _limit: data.limit,
      _guest_visible_only: false,
    });
    if (error) throw error;
    return (rows ?? []) as KbSearchHit[];
  });