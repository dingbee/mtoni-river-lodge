import { z } from "zod";
import {
  ProviderAdapterError,
  providerHttpError,
  providerIdempotencyKeySchema,
  readProviderError,
  requireServerSecret,
} from "./provider-http.server";

const emailAddressSchema = z.string().email().max(320);
const sendEmailSchema = z.object({
  from: z.string().min(3).max(320),
  to: z.union([emailAddressSchema, z.array(emailAddressSchema).min(1).max(50)]),
  cc: z.union([emailAddressSchema, z.array(emailAddressSchema).min(1).max(50)]).optional(),
  bcc: z.union([emailAddressSchema, z.array(emailAddressSchema).min(1).max(50)]).optional(),
  replyTo: z.union([emailAddressSchema, z.array(emailAddressSchema).min(1).max(10)]).optional(),
  subject: z.string().trim().min(1).max(998),
  html: z.string().min(1).max(1_000_000).optional(),
  text: z.string().min(1).max(1_000_000).optional(),
  idempotencyKey: providerIdempotencyKeySchema,
  tags: z.array(z.object({ name: z.string().min(1).max(256), value: z.string().max(256) })).max(10).optional(),
}).superRefine((value, ctx) => {
  if (!value.html && !value.text) {
    ctx.addIssue({ code: "custom", path: ["html"], message: "Provide an HTML or plain-text email body." });
  }
});

export interface ResendConfig {
  apiKey: string;
}

export interface ResendSendResult {
  provider: "resend";
  providerMessageId: string;
  acceptedAt: string;
}

type FetchLike = typeof fetch;

function getConfig(overrides?: Partial<ResendConfig>): ResendConfig {
  return {
    apiKey: requireServerSecret(
      overrides?.apiKey ?? process.env.RESEND_API_KEY,
      "RESEND_API_KEY",
      "resend",
    ),
  };
}

/**
 * Server-only Resend adapter. The API key is read only from server configuration.
 * Dispatch approval, property consent, and durable ledger writes are caller responsibilities.
 */
export async function sendResendEmail(
  input: z.input<typeof sendEmailSchema>,
  options: { config?: Partial<ResendConfig>; fetchImpl?: FetchLike } = {},
): Promise<ResendSendResult> {
  const parsed = sendEmailSchema.parse(input);
  const config = getConfig(options.config);
  const fetchImpl = options.fetchImpl ?? fetch;
  const payload = {
    from: parsed.from,
    to: parsed.to,
    ...(parsed.cc ? { cc: parsed.cc } : {}),
    ...(parsed.bcc ? { bcc: parsed.bcc } : {}),
    ...(parsed.replyTo ? { reply_to: parsed.replyTo } : {}),
    subject: parsed.subject,
    ...(parsed.html ? { html: parsed.html } : {}),
    ...(parsed.text ? { text: parsed.text } : {}),
    ...(parsed.tags ? { tags: parsed.tags } : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": parsed.idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ProviderAdapterError({
      provider: "resend",
      message: "Resend request failed before a response was received.",
      code: "network_error",
      retryable: true,
    });
  }

  if (!response.ok) {
    const error = await readProviderError(response);
    throw providerHttpError("resend", response.status, error.code, error.message);
  }

  const result = await response.json() as { id?: string };
  if (!result.id) {
    throw new ProviderAdapterError({
      provider: "resend",
      message: "Resend accepted the request but returned no email identifier.",
      code: "invalid_provider_response",
      retryable: false,
    });
  }

  return {
    provider: "resend",
    providerMessageId: result.id,
    acceptedAt: new Date().toISOString(),
  };
}
