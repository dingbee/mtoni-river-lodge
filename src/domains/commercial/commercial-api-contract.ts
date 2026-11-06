import { z } from "zod";
import { catalogueReadSchema, planDetailsSchema } from "./catalogue-contract";
import { commercialPriceResolutionInputSchema } from "./pricing-contract";
import { commercialAddonCompatibilitySchema, commercialPackageCompositionSchema } from "./package-composition-contract";
import { commercialTrialPolicyResolutionInputSchema } from "./trial-configuration-contract";
import { COMMERCIAL_ADMIN_ACTIONS } from "./founder-administration-contract";

/**
 * CC02.06 transport contracts only. These schemas describe a future API
 * boundary; they do not implement routes, authentication, persistence or IO.
 */
export const COMMERCIAL_API_VERSION = "v1" as const;

export const COMMERCIAL_API_PATHS = {
  catalogue: "/api/commercial/v1/catalogue",
  planDetails: "/api/commercial/v1/plans/:planCode",
  priceResolution: "/api/commercial/v1/prices/resolve",
  compositionValidation: "/api/commercial/v1/compositions/validate",
  trialPolicy: "/api/commercial/v1/trials/policy",
  founderAdministration: "/api/commercial/v1/founder",
} as const;

const requestId = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });

export const commercialApiRequestMetaSchema = z.object({
  requestId,
  requestedAt: timestamp.optional(),
});
export type CommercialApiRequestMeta = z.infer<typeof commercialApiRequestMetaSchema>;

export const commercialApiCatalogueRequestSchema = commercialApiRequestMetaSchema.extend({
  query: catalogueReadSchema,
});
export const commercialApiPlanDetailsRequestSchema = commercialApiRequestMetaSchema.extend({
  query: planDetailsSchema,
});
export const commercialApiPriceResolutionRequestSchema = commercialApiRequestMetaSchema.extend({
  body: commercialPriceResolutionInputSchema,
});
export const commercialApiCompositionValidationRequestSchema = commercialApiRequestMetaSchema.extend({
  body: z.object({
    composition: commercialPackageCompositionSchema,
    // Compatibility rules are explicitly supplied; absent rules are not inferred.
    compatibilityRules: z.array(commercialAddonCompatibilitySchema).default([]),
  }),
});
export const commercialApiTrialPolicyRequestSchema = commercialApiRequestMetaSchema.extend({
  query: commercialTrialPolicyResolutionInputSchema,
});
export const commercialApiFounderActionRequestSchema = commercialApiRequestMetaSchema.extend({
  body: z.object({
    action: z.enum(COMMERCIAL_ADMIN_ACTIONS),
    resourceType: z.enum([
      "plan", "plan_version", "module", "addon", "price",
      "composition", "trial_policy", "commercial_account",
    ]),
    resourceRef: z.string().trim().min(1).max(300),
    reason: z.string().trim().min(3).max(500),
  }),
});
export type CommercialApiCatalogueRequest = z.infer<typeof commercialApiCatalogueRequestSchema>;
export type CommercialApiPlanDetailsRequest = z.infer<typeof commercialApiPlanDetailsRequestSchema>;
export type CommercialApiPriceResolutionRequest = z.infer<typeof commercialApiPriceResolutionRequestSchema>;
export type CommercialApiCompositionValidationRequest = z.infer<typeof commercialApiCompositionValidationRequestSchema>;
export type CommercialApiTrialPolicyRequest = z.infer<typeof commercialApiTrialPolicyRequestSchema>;
export type CommercialApiFounderActionRequest = z.infer<typeof commercialApiFounderActionRequestSchema>;

export const commercialApiErrorCodes = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "AMBIGUOUS_CONFIGURATION",
  "PRICE_UNAVAILABLE",
  "QUOTE_REQUIRED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type CommercialApiErrorCode = (typeof commercialApiErrorCodes)[number];

export const commercialApiErrorSchema = z.object({
  code: z.enum(commercialApiErrorCodes),
  message: z.string().trim().min(1).max(500),
  fieldErrors: z.array(z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string().trim().min(1).max(300),
  })).default([]),
  retryable: z.boolean().default(false),
});
export type CommercialApiError = z.infer<typeof commercialApiErrorSchema>;

export const commercialApiSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.literal(true),
    requestId,
    data,
  });

export const commercialApiFailureEnvelopeSchema = z.object({
  ok: z.literal(false),
  requestId,
  error: commercialApiErrorSchema,
});

export const commercialApiEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion("ok", [
    commercialApiSuccessEnvelopeSchema(data),
    commercialApiFailureEnvelopeSchema,
  ]);

export type CommercialApiSuccessEnvelope<T> = {
  ok: true;
  requestId: string;
  data: T;
};
export type CommercialApiFailureEnvelope = {
  ok: false;
  requestId: string;
  error: CommercialApiError;
};

/** A stable response helper; transport handlers remain responsible for HTTP status. */
export function createCommercialApiFailure(
  id: string,
  error: CommercialApiError,
): CommercialApiFailureEnvelope {
  return {
    ok: false,
    requestId: requestId.parse(id),
    error: commercialApiErrorSchema.parse(error),
  };
}
