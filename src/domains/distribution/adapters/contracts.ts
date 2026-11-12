import { z } from "zod";

export const DISTRIBUTION_CAPABILITIES = [
  "listing.read",
  "listing.write",
  "room_mapping.read",
  "room_mapping.write",
  "rate_plan.read",
  "rate_plan.write",
  "availability.read",
  "availability.write",
  "reservation.read",
  "reservation.import",
  "reservation.update",
  "reservation.cancel",
  "connection.health",
] as const;

export const distributionCapabilitySchema = z.enum(DISTRIBUTION_CAPABILITIES);
export type DistributionCapability = z.infer<typeof distributionCapabilitySchema>;

export const distributionEnvironmentSchema = z.enum(["sandbox", "live"]);
export type DistributionEnvironment = z.infer<typeof distributionEnvironmentSchema>;

export const connectionLifecycleSchema = z.enum([
  "draft",
  "pending_validation",
  "connected",
  "degraded",
  "suspended",
  "revoked",
  "error",
]);
export type ConnectionLifecycle = z.infer<typeof connectionLifecycleSchema>;

export const adapterManifestSchema = z
  .object({
    providerKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
    adapterVersion: z
      .string()
      .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
    contractVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
    capabilities: z.array(distributionCapabilitySchema).min(1),
    environments: z.array(distributionEnvironmentSchema).min(1),
    authenticationModes: z
      .array(z.enum(["oauth2", "api_key", "signed_request", "managed_secret"]))
      .min(1),
    supportsHealthCheck: z.boolean(),
  })
  .superRefine((manifest, ctx) => {
    if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
      ctx.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: "Capabilities must be unique.",
      });
    }
    if (new Set(manifest.environments).size !== manifest.environments.length) {
      ctx.addIssue({
        code: "custom",
        path: ["environments"],
        message: "Environments must be unique.",
      });
    }
  });

export type AdapterManifest = z.infer<typeof adapterManifestSchema>;

/** Server-created context only. It contains identifiers, never caller authority or secret values. */
export type AdapterExecutionContext = Readonly<{
  organisationId: string;
  propertyId: string;
  connectionId: string;
  providerKey: string;
  externalAccountReference: string;
  environment: DistributionEnvironment;
  operation: string;
  capability: DistributionCapability;
  correlationId: string;
  adapterVersion: string;
}>;

/** Opaque credential capability; raw secret material is deliberately absent from this contract. */
export type CredentialHandle = Readonly<{
  reference: string;
  environment: DistributionEnvironment;
  connectionId: string;
}>;

export type NormalizedAdapterErrorCode =
  | "authentication"
  | "authorization"
  | "configuration"
  | "unsupported_capability"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "invalid_request"
  | "conflict"
  | "not_found"
  | "permanent_provider_error"
  | "unknown";

export type NormalizedAdapterError = Readonly<{
  code: NormalizedAdapterErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
  safeMessage: string;
  providerCode?: string;
  correlationId: string;
}>;

export type AdapterHealth = Readonly<{
  state: "healthy" | "degraded" | "unavailable" | "unknown";
  checkedAt: string;
  latencyMs?: number;
  error?: NormalizedAdapterError;
}>;

export type AdapterResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: NormalizedAdapterError }>;

export interface DistributionAdapter {
  readonly manifest: AdapterManifest;
  healthCheck?(
    context: AdapterExecutionContext,
    credential: CredentialHandle,
  ): Promise<AdapterResult<AdapterHealth>>;
}

export class AdapterContractError extends Error {
  readonly code:
    | "invalid_manifest"
    | "duplicate_adapter"
    | "adapter_not_found"
    | "unsupported_capability"
    | "incompatible_contract";
  constructor(code: AdapterContractError["code"], message: string) {
    super(message);
    this.name = "AdapterContractError";
    this.code = code;
  }
}

export function validateAdapterManifest(input: unknown): AdapterManifest {
  const parsed = adapterManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AdapterContractError(
      "invalid_manifest",
      "Adapter manifest failed contract validation.",
    );
  }
  if (parsed.data.capabilities.includes("connection.health") && !parsed.data.supportsHealthCheck) {
    throw new AdapterContractError(
      "invalid_manifest",
      "connection.health requires a healthCheck implementation.",
    );
  }
  return parsed.data;
}
