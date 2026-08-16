/**
 * Header → ResPad field detection for tabular intake (CSV / XLSX / extracted
 * document tables). Pure and dependency free.
 *
 * Ambiguous headers are NEVER guessed silently: they are reported as
 * `needs_review` and their raw values are still preserved on the record.
 */
import type { RespadRawRecord } from "../normalize";
import type { FieldMapping } from "./types";

/** Canonical ResPad fields understood by the existing normalizer. */
export const RESPAD_FIELDS = [
  "company_id",
  "groupname",
  "clientname",
  "address",
  "telephone",
  "mobile",
  "email",
  "website",
  "tin",
  "vrn",
  "paymentmode",
  "country",
  "other",
] as const;

export type RespadField = (typeof RESPAD_FIELDS)[number];

const EXACT: Record<string, RespadField> = {
  company_id: "company_id",
  companyid: "company_id",
  id: "company_id",
  groupname: "groupname",
  group: "groupname",
  clientname: "clientname",
  client: "clientname",
  address: "address",
  telephone: "telephone",
  tel: "telephone",
  phone: "telephone",
  mobile: "mobile",
  cell: "mobile",
  email: "email",
  website: "website",
  url: "website",
  tin: "tin",
  vrn: "vrn",
  paymentmode: "paymentmode",
  country: "country",
  other: "other",
  notes: "other",
};

/** Fuzzy signals — a header may match several, which makes it ambiguous. */
const SIGNALS: { field: RespadField; tokens: string[] }[] = [
  { field: "company_id", tokens: ["company id", "companycode", "account id", "legacy id", "ref no"] },
  { field: "groupname", tokens: ["group name", "group", "segment", "category", "rate group"] },
  { field: "clientname", tokens: ["client", "company", "customer", "account name", "agent", "organisation", "organization", "name"] },
  { field: "address", tokens: ["address", "physical address", "postal", "location", "street", "city"] },
  { field: "telephone", tokens: ["telephone", "tel", "phone", "landline", "contact number"] },
  { field: "mobile", tokens: ["mobile", "cell", "whatsapp", "msisdn"] },
  { field: "email", tokens: ["email", "e-mail", "mail"] },
  { field: "website", tokens: ["website", "web", "url", "site", "domain"] },
  { field: "tin", tokens: ["tin", "tax id", "taxpayer", "tax number"] },
  { field: "vrn", tokens: ["vrn", "vat", "vat number", "vat reg"] },
  { field: "paymentmode", tokens: ["payment", "payment mode", "terms", "billing"] },
  { field: "country", tokens: ["country", "nationality"] },
  { field: "other", tokens: ["other", "remarks", "comment", "notes", "description"] },
];

function slug(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Detect the ResPad target for a single header. */
export function detectField(header: string): FieldMapping {
  const raw = header ?? "";
  const label = raw.trim();
  if (!label) {
    return { header: raw, target: null, confidence: "none", status: "needs_review", reason: "Blank column header" };
  }

  const exact = EXACT[compact(label)];
  if (exact) return { header: label, target: exact, confidence: "high", status: "mapped" };

  const s = slug(label);
  const hits = new Set<RespadField>();
  for (const sig of SIGNALS) {
    if (sig.tokens.some((t) => s === t || s.includes(t))) hits.add(sig.field);
  }

  if (hits.size === 1) {
    return { header: label, target: [...hits][0]!, confidence: "medium", status: "mapped" };
  }
  if (hits.size > 1) {
    return {
      header: label,
      target: null,
      confidence: "none",
      status: "needs_review",
      reason: `Ambiguous — could be ${[...hits].join(" or ")}`,
    };
  }
  return {
    header: label,
    target: null,
    confidence: "none",
    status: "needs_review",
    reason: "No matching ResPad field",
  };
}

export type MappingPlan = {
  mapping: FieldMapping[];
  mappedCount: number;
  reviewCount: number;
  hasIdentity: boolean;
};

/** Build the mapping plan for a header row. Duplicate targets are flagged. */
export function buildMappingPlan(headers: string[], overrides: Record<string, string | null> = {}): MappingPlan {
  const mapping = headers.map((h) => {
    const key = (h ?? "").trim();
    if (key in overrides) {
      const target = overrides[key];
      return target
        ? ({ header: key, target, confidence: "high", status: "mapped", reason: "Manual mapping" } as FieldMapping)
        : ({ header: key, target: null, confidence: "none", status: "ignored", reason: "Ignored by reviewer" } as FieldMapping);
    }
    return detectField(h);
  });

  const used = new Map<string, number>();
  for (const m of mapping) if (m.target) used.set(m.target, (used.get(m.target) ?? 0) + 1);
  for (const m of mapping) {
    if (m.target && (used.get(m.target) ?? 0) > 1 && m.confidence !== "high") {
      m.status = "needs_review";
      m.reason = `Several columns map to "${m.target}"`;
      m.target = null;
      m.confidence = "none";
    }
  }

  return {
    mapping,
    mappedCount: mapping.filter((m) => m.status === "mapped").length,
    reviewCount: mapping.filter((m) => m.status === "needs_review").length,
    hasIdentity: mapping.some((m) => m.status === "mapped" && m.target === "clientname"),
  };
}

/**
 * Convert tabular rows to ResPad raw records. Unmapped columns are preserved
 * verbatim under an `unmapped__<header>` key so nothing is discarded.
 */
export function rowsToRecords(
  rows: Record<string, unknown>[],
  mapping: FieldMapping[],
): RespadRawRecord[] {
  return rows.map((row) => {
    const rec: RespadRawRecord = {};
    for (const m of mapping) {
      const value = row[m.header];
      if (value === undefined) continue;
      if (m.target && m.status === "mapped") {
        const existing = rec[m.target];
        rec[m.target] =
          existing == null || existing === ""
            ? (value as never)
            : (`${existing} / ${String(value)}` as never);
      } else if (m.status !== "ignored") {
        rec[`unmapped__${m.header}`] = value;
      }
    }
    return rec;
  });
}