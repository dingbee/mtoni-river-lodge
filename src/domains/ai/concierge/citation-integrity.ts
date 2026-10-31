import type { ConciergeCitation } from "./concierge.types";

export interface ModelCitationReference {
  source_id?: unknown;
  title?: unknown;
  chunk_index?: unknown;
}

/**
 * Only expose citations that resolve to the exact retrieved evidence set.
 * Unknown IDs, mismatched titles/chunks, and malformed model output are discarded.
 */
export function selectGroundedConciergeCitations(
  retrieved: ConciergeCitation[],
  proposed: unknown,
): ConciergeCitation[] {
  if (!Array.isArray(proposed)) return [];
  const allowed = new Map(
    retrieved.map((citation) => [
      `${citation.source_id}:${citation.chunk_index ?? "null"}`,
      citation,
    ]),
  );
  const selected = new Set<string>();

  for (const value of proposed) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as ModelCitationReference;
    if (typeof candidate.source_id !== "string") continue;
    const matches = retrieved.filter((citation) => citation.source_id === candidate.source_id);
    for (const citation of matches) {
      if (typeof candidate.title === "string" && candidate.title !== citation.title) continue;
      if (typeof candidate.chunk_index === "number" && candidate.chunk_index !== citation.chunk_index) continue;
      selected.add(`${citation.source_id}:${citation.chunk_index ?? "null"}`);
    }
  }

  return [...selected].map((key) => allowed.get(key)).filter((value): value is ConciergeCitation => Boolean(value));
}
