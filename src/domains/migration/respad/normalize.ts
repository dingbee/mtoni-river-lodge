/**
 * ResPad → Mtoni OS migration: pure normalization, classification and
 * duplicate-detection logic.
 *
 * This module is intentionally dependency-free and side-effect free so it can
 * run on the server during staging and in tests. It NEVER mutates or discards
 * the original source values — every function returns *additional* normalized
 * values alongside the untouched legacy fields.
 */

export const RESPAD_SOURCE_FILES = [
  "RACK_RATES.json",
  "STO.json",
  "STO_-_LOW.json",
] as const;

export type RespadRawRecord = {
  groupname?: string | null;
  clientname?: string | null;
  address?: string | null;
  telephone?: string | null;
  tin?: string | null;
  vrn?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  other?: string | null;
  paymentmode?: string | null;
  country?: string | null;
  company_id?: string | null;
  [key: string]: unknown;
};

export type AccountType =
  | "ota"
  | "booking_channel"
  | "tour_operator"
  | "corporate"
  | "organization"
  | "direct"
  | "other"
  | "unknown";

export type DuplicateConfidence = "high" | "medium" | "low";

/* ------------------------------------------------------------------ atoms */

const PLACEHOLDERS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "null",
  "nil",
  "0",
  "unknown",
  ".",
  "x",
  "xx",
  "xxx",
]);

/** Trim + collapse repeated whitespace. Returns null for placeholder junk. */
export function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (PLACEHOLDERS.has(s.toLowerCase())) return null;
  return s.length ? s : null;
}

const LEGAL_SUFFIXES = [
  "limited",
  "ltd",
  "co ltd",
  "company limited",
  "company",
  "co",
  "inc",
  "incorporated",
  "llc",
  "plc",
  "gmbh",
  "bv",
  "sarl",
  "pty",
  "corp",
  "corporation",
];

/**
 * Matching key for a company name: lowercase, punctuation-stripped,
 * legal-suffix-stripped, whitespace-collapsed. Used ONLY for matching.
 */
export function nameMatchKey(name: string | null): string | null {
  const base = cleanText(name);
  if (!base) return null;
  let s = base
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'"`’()\[\]{}/\\|:;!?*#]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // strip trailing legal suffixes (repeatedly, e.g. "x co ltd")
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (s.endsWith(" " + suf)) {
        s = s.slice(0, -(suf.length + 1)).trim();
        changed = true;
      }
    }
  }
  return s.length ? s : null;
}

/** Presentation-safe normalized account name (original casing preserved when sane). */
export function normalizeAccountName(name: string | null): string | null {
  const s = cleanText(name);
  if (!s) return null;
  // Only re-case names that are fully upper/lower — otherwise keep as authored.
  const isAllUpper = s === s.toUpperCase();
  const isAllLower = s === s.toLowerCase();
  if (!isAllUpper && !isAllLower) return s;
  return s
    .split(" ")
    .map((w) => {
      if (/^[0-9]+$/.test(w)) return w;
      if (w.length <= 3 && /^[A-Za-z]+$/.test(w) && isAllUpper) return w.toUpperCase();
      if (w.includes(".")) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** Split a free-text contact field into individual candidate emails. */
export function normalizeEmails(v: unknown): { valid: string[]; malformed: string[] } {
  const raw = cleanText(v);
  if (!raw) return { valid: [], malformed: [] };
  const parts = raw
    .split(/[,;/|\s]+/)
    .map((p) => p.replace(/^mailto:/i, "").replace(/[.,;]+$/, "").trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const malformed: string[] = [];
  for (const p of parts) {
    if (EMAIL_RE.test(p)) {
      if (!valid.includes(p)) valid.push(p);
    } else if (p.includes("@") || p.length > 3) {
      if (!malformed.includes(p)) malformed.push(p);
    }
  }
  return { valid, malformed };
}

/**
 * Normalize a phone number to E.164 where it is safe to infer.
 * Tanzania (+255) is assumed for local 0-prefixed 10-digit numbers only.
 */
export function normalizePhone(v: unknown): string | null {
  const raw = cleanText(v);
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    return digits.length >= 7 ? "+" + digits : null;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.startsWith("255") && digits.length >= 11) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+255" + digits.slice(1);
  if (digits.length >= 7) return digits; // kept, but not asserted as E.164
  return null;
}

export function normalizePhones(...vals: unknown[]): { valid: string[]; malformed: string[] } {
  const valid: string[] = [];
  const malformed: string[] = [];
  for (const v of vals) {
    const raw = cleanText(v);
    if (!raw) continue;
    for (const chunk of raw.split(/[,;/|]+/)) {
      const c = cleanText(chunk);
      if (!c) continue;
      const n = normalizePhone(c);
      if (n && n.startsWith("+")) {
        if (!valid.includes(n)) valid.push(n);
      } else if (n) {
        if (!valid.includes(n)) valid.push(n);
        if (!malformed.includes(c)) malformed.push(c);
      } else if (!malformed.includes(c)) {
        malformed.push(c);
      }
    }
  }
  return { valid, malformed };
}

export function normalizeWebsite(v: unknown): { website: string | null; domain: string | null } {
  const raw = cleanText(v);
  if (!raw) return { website: null, domain: null };
  const first = raw.split(/[,;\s]+/)[0] ?? raw;
  let host = first
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  const slash = host.indexOf("/");
  const domain = (slash > -1 ? host.slice(0, slash) : host).replace(/[^a-z0-9.\-]/g, "");
  if (!domain.includes(".")) return { website: raw, domain: null };
  return { website: "https://" + host, domain };
}

/** Tax identifiers: strip separators, uppercase. Placeholders become null. */
export function normalizeTaxId(v: unknown): string | null {
  const raw = cleanText(v);
  if (!raw) return null;
  const s = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!s || /^0+$/.test(s) || s.length < 5) return null;
  return s;
}

/* --------------------------------------------------------- classification */

const OTA_HINTS = [
  "booking.com",
  "bookingcom",
  "expedia",
  "agoda",
  "airbnb",
  "hotels.com",
  "trivago",
  "hostelworld",
  "tripadvisor",
  "despegar",
  "ctrip",
  "trip.com",
  "makemytrip",
  "hotelbeds",
  "jumia travel",
];
const TOUR_HINTS = [
  "safari",
  "safaris",
  "adventure",
  "adventures",
  "tours",
  "tour",
  "travel",
  "expedition",
  "expeditions",
  "trek",
  "treks",
  "holidays",
  "voyage",
  "voyages",
  "journeys",
  "destination",
];
const CORPORATE_HINTS = ["bank", "insurance", "consult", "logistics", "mining", "petrol", "energy", "telecom"];
const ORG_HINTS = ["foundation", "ngo", "trust", "embassy", "mission", "university", "school", "council", "unicef", "undp", "wwf"];

export type Classification = {
  account_type: AccountType;
  classification_source: "migration_rule";
  classification_evidence: string;
};

/** Preliminary classification. Inferred, never asserted as verified fact. */
export function classifyAccount(name: string | null, domain: string | null): Classification {
  const n = (nameMatchKey(name) ?? "").toLowerCase();
  const d = (domain ?? "").toLowerCase();
  const hay = `${n} ${d}`.trim();
  const rule = (t: AccountType, why: string): Classification => ({
    account_type: t,
    classification_source: "migration_rule",
    classification_evidence: why,
  });

  if (!hay) return rule("unknown", "no name or domain available");
  if (n === "direct" || n === "walk in" || n === "walkin" || n === "rack rates")
    return rule("direct", `name matches direct-business keyword "${n}"`);
  for (const h of OTA_HINTS) if (hay.includes(h)) return rule("ota", `matched OTA keyword "${h}"`);
  for (const h of ORG_HINTS) if (hay.includes(h)) return rule("organization", `matched organization keyword "${h}"`);
  for (const h of TOUR_HINTS)
    if (new RegExp(`(^| )${h}( |$)`).test(n) || d.includes(h))
      return rule("tour_operator", `matched tour-operator keyword "${h}"`);
  for (const h of CORPORATE_HINTS) if (hay.includes(h)) return rule("corporate", `matched corporate keyword "${h}"`);
  return rule("unknown", "no classification rule matched — requires manual review");
}

/* ------------------------------------------------------- record normalizer */

export type NormalizedStagingRow = {
  source_file: string;
  source_row_index: number;
  source_row_key: string;
  legacy_company_id: string | null;
  legacy_groupname: string | null;
  legacy_clientname: string | null;
  legacy_address: string | null;
  legacy_telephone: string | null;
  legacy_mobile: string | null;
  legacy_email: string | null;
  legacy_website: string | null;
  legacy_tin: string | null;
  legacy_vrn: string | null;
  legacy_other: string | null;
  legacy_payment_mode: string | null;
  legacy_country: string | null;
  normalized_account_name: string | null;
  normalized_match_key: string | null;
  normalized_email: string | null;
  normalized_emails: string[];
  normalized_phone: string | null;
  normalized_phones: string[];
  normalized_website: string | null;
  normalized_domain: string | null;
  normalized_tin: string | null;
  normalized_vrn: string | null;
  normalized_address: string | null;
  normalized_country: string | null;
  account_type: AccountType;
  classification_source: string;
  normalization_status: string;
  review_status: string;
  quality_flags: string[];
  raw_record: RespadRawRecord;
};

/** Stable identity for idempotent re-runs. */
export function sourceRowKey(rec: RespadRawRecord, index: number): string {
  const parts = [
    cleanText(rec.company_id) ?? "",
    (nameMatchKey(cleanText(rec.groupname)) ?? cleanText(rec.groupname) ?? "").toLowerCase(),
    (nameMatchKey(cleanText(rec.clientname)) ?? "").toLowerCase(),
    (normalizeTaxId(rec.tin) ?? ""),
    (normalizeEmails(rec.email).valid[0] ?? ""),
    (normalizePhone(rec.telephone) ?? ""),
    (normalizePhone(rec.mobile) ?? ""),
  ];
  const key = parts.join("|");
  // Records with no distinguishing identity at all fall back to their position
  // so they are still preserved rather than silently collapsed.
  return parts.slice(1).some(Boolean) ? key : `${key}|#${index}`;
}

export function normalizeRecord(
  rec: RespadRawRecord,
  sourceFile: string,
  index: number,
): NormalizedStagingRow {
  const clientname = cleanText(rec.clientname);
  const groupname = cleanText(rec.groupname);
  const emails = normalizeEmails(rec.email);
  const phones = normalizePhones(rec.telephone, rec.mobile);
  const site = normalizeWebsite(rec.website);
  const tin = normalizeTaxId(rec.tin);
  const vrn = normalizeTaxId(rec.vrn);
  const matchKey = nameMatchKey(clientname);

  const flags: string[] = [];
  if (!clientname) flags.push("missing_client_name");
  if (!groupname) flags.push("missing_group");
  if (!emails.valid.length) flags.push("missing_email");
  if (emails.malformed.length) flags.push("malformed_email");
  if (emails.valid.length > 1) flags.push("multiple_emails");
  if (!phones.valid.length) flags.push("missing_phone");
  if (phones.malformed.length) flags.push("malformed_phone");
  if (!tin) flags.push("missing_tin");
  if (!vrn) flags.push("missing_vrn");
  if (!site.domain) flags.push("missing_website");
  if (!cleanText(rec.address)) flags.push("missing_address");

  const classification = classifyAccount(clientname, site.domain);

  // A record is only "failed" when it cannot be identified at all. It is still
  // retained in staging and flagged for review — never discarded.
  const normalization_status = !matchKey ? "failed" : flags.length ? "partial" : "ok";

  return {
    source_file: sourceFile,
    source_row_index: index,
    source_row_key: sourceRowKey(rec, index),
    legacy_company_id: cleanText(rec.company_id),
    legacy_groupname: groupname,
    legacy_clientname: clientname,
    legacy_address: cleanText(rec.address),
    legacy_telephone: cleanText(rec.telephone),
    legacy_mobile: cleanText(rec.mobile),
    legacy_email: cleanText(rec.email),
    legacy_website: cleanText(rec.website),
    legacy_tin: cleanText(rec.tin),
    legacy_vrn: cleanText(rec.vrn),
    legacy_other: cleanText(rec.other),
    legacy_payment_mode: cleanText(rec.paymentmode),
    legacy_country: cleanText(rec.country),
    normalized_account_name: normalizeAccountName(clientname),
    normalized_match_key: matchKey,
    normalized_email: emails.valid[0] ?? null,
    normalized_emails: emails.valid,
    normalized_phone: phones.valid[0] ?? null,
    normalized_phones: phones.valid,
    normalized_website: site.website,
    normalized_domain: site.domain,
    normalized_tin: tin,
    normalized_vrn: vrn,
    normalized_address: cleanText(rec.address),
    normalized_country: cleanText(rec.country),
    account_type: classification.account_type,
    classification_source: classification.classification_source,
    normalization_status,
    review_status: normalization_status === "ok" ? "auto_ok" : "pending",
    quality_flags: flags,
    raw_record: rec,
  };
}

/* --------------------------------------------------- normalized accounts */

export type NormalizedAccountCandidate = {
  match_key: string;
  account_name: string;
  legacy_clientnames: string[];
  legacy_company_ids: string[];
  source_files: string[];
  groupnames: string[];
  emails: string[];
  phones: string[];
  websites: string[];
  domains: string[];
  tins: string[];
  vrns: string[];
  addresses: string[];
  payment_modes: string[];
  country: string | null;
  account_type: AccountType;
  classification_source: string;
  classification_evidence: string;
  source_record_count: number;
  quality_flags: string[];
  rows: NormalizedStagingRow[];
};

function push(target: string[], v: string | null | undefined) {
  if (v && !target.includes(v)) target.push(v);
}

/**
 * Collapse staging rows into unique account candidates.
 *
 * Rows are grouped by normalized company-name key ONLY. groupname is never
 * folded into the account identity — it becomes a commercial relationship.
 * Rows that could not be normalized are kept as their own candidates so they
 * remain visible for manual review.
 */
export function buildNormalizedAccounts(rows: NormalizedStagingRow[]): NormalizedAccountCandidate[] {
  const byKey = new Map<string, NormalizedAccountCandidate>();
  rows.forEach((r, i) => {
    const key = r.normalized_match_key ?? `__unnormalized__${r.source_file}#${r.source_row_index ?? i}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        match_key: key,
        account_name: r.normalized_account_name ?? r.legacy_clientname ?? "(unnamed record)",
        legacy_clientnames: [],
        legacy_company_ids: [],
        source_files: [],
        groupnames: [],
        emails: [],
        phones: [],
        websites: [],
        domains: [],
        tins: [],
        vrns: [],
        addresses: [],
        payment_modes: [],
        country: null,
        account_type: "unknown",
        classification_source: "migration_rule",
        classification_evidence: "",
        source_record_count: 0,
        quality_flags: [],
        rows: [],
      };
      byKey.set(key, acc);
    }
    acc.rows.push(r);
    acc.source_record_count += 1;
    push(acc.legacy_clientnames, r.legacy_clientname);
    push(acc.legacy_company_ids, r.legacy_company_id);
    push(acc.source_files, r.source_file);
    push(acc.groupnames, r.legacy_groupname);
    r.normalized_emails.forEach((e) => push(acc!.emails, e));
    r.normalized_phones.forEach((p) => push(acc!.phones, p));
    push(acc.websites, r.normalized_website);
    push(acc.domains, r.normalized_domain);
    push(acc.tins, r.normalized_tin);
    push(acc.vrns, r.normalized_vrn);
    push(acc.addresses, r.normalized_address);
    push(acc.payment_modes, r.legacy_payment_mode);
    if (!acc.country) acc.country = r.normalized_country;
  });

  for (const acc of byKey.values()) {
    const cls = classifyAccount(acc.account_name, acc.domains[0] ?? null);
    acc.account_type = cls.account_type;
    acc.classification_evidence = cls.classification_evidence;
    const flags: string[] = [];
    if (!acc.emails.length) flags.push("missing_email");
    if (acc.emails.length > 1) flags.push("multiple_emails");
    if (!acc.phones.length) flags.push("missing_phone");
    if (!acc.tins.length) flags.push("missing_tin");
    if (!acc.vrns.length) flags.push("missing_vrn");
    if (!acc.domains.length) flags.push("missing_website");
    if (acc.groupnames.length > 1) flags.push("multiple_groups");
    if (acc.source_record_count > 1) flags.push("consolidated_from_multiple_records");
    if (acc.tins.length > 1) flags.push("conflicting_tin");
    if (acc.vrns.length > 1) flags.push("conflicting_vrn");
    if (acc.match_key.startsWith("__unnormalized__")) flags.push("normalization_failed");
    acc.quality_flags = flags;
  }

  return [...byKey.values()].sort((a, b) => a.account_name.localeCompare(b.account_name));
}

/* ------------------------------------------------------ duplicate detection */

/** Dice coefficient over character bigrams — 0..1. */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const pool = [...B];
  let hits = 0;
  for (const g of A) {
    const i = pool.indexOf(g);
    if (i > -1) {
      hits++;
      pool.splice(i, 1);
    }
  }
  return (2 * hits) / (A.length + B.length);
}

export type DuplicateGroup = {
  key: string;
  confidence: DuplicateConfidence;
  signals: string[];
  reason: string;
  members: string[]; // match_key list
  proposed_master: string;
  proposed_action: "review" | "merge_recommended";
};

const CONF_RANK: Record<DuplicateConfidence, number> = { high: 3, medium: 2, low: 1 };

function completeness(a: NormalizedAccountCandidate) {
  return (
    a.source_record_count * 2 +
    a.emails.length +
    a.phones.length +
    a.tins.length * 2 +
    a.vrns.length * 2 +
    a.domains.length +
    a.addresses.length
  );
}

/**
 * Cross-account duplicate detection. Accounts that already collapsed under a
 * single normalized name are NOT reported here (they are one account by
 * definition); this finds distinct candidates that may be the same business.
 * Nothing is ever merged automatically.
 */
export function detectDuplicates(accounts: NormalizedAccountCandidate[]): DuplicateGroup[] {
  type Pair = { a: string; b: string; conf: DuplicateConfidence; signal: string };
  const pairs: Pair[] = [];

  const indexBy = (pick: (a: NormalizedAccountCandidate) => string[]) => {
    const m = new Map<string, string[]>();
    for (const a of accounts)
      for (const v of pick(a)) {
        const list = m.get(v) ?? [];
        if (!list.includes(a.match_key)) list.push(a.match_key);
        m.set(v, list);
      }
    return m;
  };

  const addFromIndex = (
    m: Map<string, string[]>,
    conf: DuplicateConfidence,
    label: string,
  ) => {
    for (const [value, keys] of m) {
      if (keys.length < 2) continue;
      for (let i = 0; i < keys.length; i++)
        for (let j = i + 1; j < keys.length; j++)
          pairs.push({ a: keys[i]!, b: keys[j]!, conf, signal: `${label}: ${value}` });
    }
  };

  addFromIndex(indexBy((a) => a.tins), "high", "same TIN");
  addFromIndex(indexBy((a) => a.vrns), "high", "same VRN");
  addFromIndex(indexBy((a) => a.emails), "high", "same email");
  addFromIndex(indexBy((a) => a.phones), "medium", "same phone");
  addFromIndex(indexBy((a) => a.domains), "medium", "same web domain");

  // name + phone / name + address → high; similar names only → low
  const byKey = new Map(accounts.map((a) => [a.match_key, a]));
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const a = accounts[i]!;
      const b = accounts[j]!;
      const sim = nameSimilarity(a.match_key, b.match_key);
      if (sim < 0.82) continue;
      const sharedPhone = a.phones.some((p) => b.phones.includes(p));
      const sharedAddr = a.addresses.some((x) =>
        b.addresses.some((y) => x.toLowerCase() === y.toLowerCase()),
      );
      if (sim >= 0.95 && (sharedPhone || sharedAddr)) {
        pairs.push({
          a: a.match_key,
          b: b.match_key,
          conf: "high",
          signal: `near-identical name + ${sharedPhone ? "matching phone" : "matching address"}`,
        });
      } else if (sim >= 0.9) {
        pairs.push({ a: a.match_key, b: b.match_key, conf: "medium", signal: `very similar name (${sim.toFixed(2)})` });
      } else {
        pairs.push({ a: a.match_key, b: b.match_key, conf: "low", signal: `similar name only (${sim.toFixed(2)})` });
      }
    }
  }

  if (!pairs.length) return [];

  // union-find over pairs
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) {
      parent.set(x, x);
      return x;
    }
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const p of pairs) union(p.a, p.b);

  const groups = new Map<string, DuplicateGroup>();
  for (const p of pairs) {
    const root = find(p.a);
    let g = groups.get(root);
    if (!g) {
      g = {
        key: root,
        confidence: p.conf,
        signals: [],
        reason: "",
        members: [],
        proposed_master: root,
        proposed_action: "review",
      };
      groups.set(root, g);
    }
    if (!g.members.includes(p.a)) g.members.push(p.a);
    if (!g.members.includes(p.b)) g.members.push(p.b);
    if (!g.signals.includes(p.signal)) g.signals.push(p.signal);
    if (CONF_RANK[p.conf] > CONF_RANK[g.confidence]) g.confidence = p.conf;
  }

  for (const g of groups.values()) {
    g.reason = g.signals.join("; ");
    const master = g.members
      .map((k) => byKey.get(k)!)
      .filter(Boolean)
      .sort((a, b) => completeness(b) - completeness(a))[0];
    if (master) g.proposed_master = master.match_key;
    // Merging is only *recommended* on hard identifier evidence, and is never
    // executed by this phase.
    g.proposed_action =
      g.confidence === "high" && g.signals.some((s) => /same TIN|same VRN/.test(s))
        ? "merge_recommended"
        : "review";
  }

  return [...groups.values()].sort((a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence]);
}

/* ---------------------------------------------------------- mapping preview */

/**
 * How a normalized ResPad account WOULD map into Mtoni OS.
 *
 * Mtoni OS currently has no organization/account entity — `bookings.source` is
 * a free-text column and `guests` models individual people. The target table
 * below therefore does not exist yet and is a declared schema gap for Phase 2.
 */
export const MTONI_TARGET_TABLE = "public.accounts (PROPOSED — does not exist yet)";

export const MTONI_FIELD_MAP: { source: string; target: string; note: string }[] = [
  { source: "normalized_account_name", target: "accounts.name", note: "display name" },
  { source: "legacy_clientname", target: "accounts.legacy_name", note: "original ResPad value, preserved" },
  { source: "account_type", target: "accounts.account_type", note: "inferred by migration rule; needs confirmation" },
  { source: "normalized_emails[]", target: "accounts.email + account_contacts[]", note: "first email primary, rest as contacts" },
  { source: "normalized_phones[]", target: "accounts.phone_e164", note: "E.164 where inferable" },
  { source: "normalized_address", target: "accounts.address", note: "" },
  { source: "normalized_website", target: "accounts.website", note: "" },
  { source: "normalized_tin", target: "accounts.tin", note: "tax identifier" },
  { source: "normalized_vrn", target: "accounts.vrn", note: "VAT identifier" },
  { source: "legacy_payment_mode", target: "accounts.payment_terms", note: "free text; needs mapping vocabulary" },
  { source: "normalized_country", target: "accounts.country", note: "null in most ResPad records" },
  { source: "legacy_company_id", target: "accounts.legacy_company_id", note: "ResPad company id" },
  { source: "groupnames[]", target: "account_commercial_groups[] (PROPOSED)", note: "one row per ResPad group — NOT flattened onto the account" },
  { source: "raw_record", target: "accounts.legacy_payload jsonb", note: "full original record retained" },
];

export const MTONI_SCHEMA_GAPS: string[] = [
  "No `accounts` / `organizations` / `companies` table exists — B2B trade accounts have no home in Mtoni OS today.",
  "No `account_commercial_groups` (rate-relationship) table — ResPad group membership cannot yet be represented.",
  "`bookings.source` is free text with no foreign key — reservations cannot yet be linked to a trade account.",
  "`guests` models individual people (email, phone_e164, nationality) and is not a suitable home for company records.",
  "No rate-plan entity keyed by commercial group — `pricing_rules` is room/date scoped, not account scoped.",
  "No account-level payment-terms vocabulary; ResPad `paymentmode` is free text.",
];