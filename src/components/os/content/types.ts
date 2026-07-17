import type { CmsBlockKind } from "@/domains/content/pages/blocks";

/** Editor-local block shape (adds a stable client `uid` for dnd + selection). */
export interface BlockDraft {
  uid: string;
  id?: string;
  kind: CmsBlockKind;
  data: Record<string, unknown>;
}