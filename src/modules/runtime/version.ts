/**
 * StayNas — Hospitality Operating System
 * Version & migration compatibility contract.
 */

export const STAYNAS_PRODUCT = "StayNas — Hospitality Operating System";

/** Application (bundle) version. */
export const APP_VERSION = "1.2.0";

/**
 * Database schema contract the application requires. The migration ledger
 * stores the applied schema version; the runtime refuses to serve when the
 * two are incompatible.
 */
export const REQUIRED_SCHEMA_VERSION = "2026.08.17";

/** Minimum PostgreSQL major version supported by the local appliance. */
export const MIN_POSTGRES_MAJOR = 16;

export type CompatibilityVerdict =
  | { compatible: true; reason: "ok" }
  | { compatible: false; reason: "schema-behind" | "schema-ahead" | "schema-unknown" | "postgres-too-old" };

export function parsePostgresMajor(serverVersion: string | undefined | null): number | null {
  if (!serverVersion) return null;
  const match = /^(\\d+)/.exec(serverVersion.trim());
  return match ? Number(match[1]) : null;
}

export function checkCompatibility(input: {
  schemaVersion?: string | null;
  requiredSchemaVersion?: string;
  postgresVersion?: string | null;
}): CompatibilityVerdict {
  const required = input.requiredSchemaVersion ?? REQUIRED_SCHEMA_VERSION;
  const major = parsePostgresMajor(input.postgresVersion);
  if (major !== null && major < MIN_POSTGRES_MAJOR) {
    return { compatible: false, reason: "postgres-too-old" };
  }
  const actual = input.schemaVersion?.trim();
  if (!actual) return { compatible: false, reason: "schema-unknown" };
  if (actual === required) return { compatible: true, reason: "ok" };
  return { compatible: false, reason: actual < required ? "schema-behind" : "schema-ahead" };
}