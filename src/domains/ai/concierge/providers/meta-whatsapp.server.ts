import { z } from "zod";
import {
  ProviderAdapterError,
  providerHttpError,
  providerIdempotencyKeySchema,
  readProviderError,
  requireServerSecret,
} from "./provider-http.server";

const textInputSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, "Recipient must be an E.164 phone number."),
  text: z.string().trim().min(1).max(4096),
  idempotencyKey: providerIdempotencyKeySchema,
});

const templateInputSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, "Recipient must be an E.164 phone number."),
  name: z.string().regex(/^[a-z0-9_]{1,512}$/),
  languageCode: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
  components: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
  idempotencyKey: providerIdempotencyKeySchema,
});

export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
}

export interface WhatsAppSendResult {
  provider: "meta_cloud_api";
  providerMessageId: string;
  acceptedAt: string;
}

type FetchLike = typeof fetch;

function getConfig(overrides?: Partial<MetaWhatsAppConfig>): MetaWhatsAppConfig {
  const accessToken = requireServerSecret(
    overrides?.accessToken ?? process.env.META_WHATSAPP_ACCESS_TOKEN,
    "META_WHATSAPP_ACCESS_TOKEN",
    "meta_cloud_api",
  );
  const phoneNumberId = requireServerSecret(
    overrides?.phoneNumberId ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID,
    "META_WHATSAPP_PHONE_NUMBER_ID",
    "meta_cloud_api",
  );
  const graphApiVersion = requireServerSecret(
    overrides?.graphApiVersion ?? process.env.META_GRAPH_API_VERSION,
    "META_GRAPH_API_VERSION",
    "meta_cloud_api",
  );
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new ProviderAdapterError({
      provider: "meta_cloud_api",
      message: "META_GRAPH_API_VERSION must use the versioned Graph API format (for example vXX.X).",
      code: "invalid_provider_configuration",
    });
  }
  if (!/^\d+$/.test(phoneNumberId)) {
    throw new ProviderAdapterError({
      provider: "meta_cloud_api",
      message: "META_WHATSAPP_PHONE_NUMBER_ID must be numeric.",
      code: "invalid_provider_configuration",
    });
  }
  return { accessToken, phoneNumberId, graphApiVersion };
}

/**
 * Server-only Meta WhatsApp Cloud API adapter.
 * Persist the dispatch attempt and enforce consent/approval before calling this adapter.
 * Meta does not expose a general send-message idempotency header; callers must enforce
 * single-dispatch semantics in the StayNas ledger before invoking this function.
 */
export async function sendWhatsAppText(
  input: z.input<typeof textInputSchema>,
  options: { config?: Partial<MetaWhatsAppConfig>; fetchImpl?: FetchLike } = {},
): Promise<WhatsAppSendResult> {
  const parsed = textInputSchema.parse(input);
  const config = getConfig(options.config);
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: parsed.to.replace("+", ""),
        type: "text",
        text: { preview_url: false, body: parsed.text },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ProviderAdapterError({
      provider: "meta_cloud_api",
      message: "Meta WhatsApp request failed before a response was received.",
      code: "network_error",
      retryable: true,
    });
  }

  if (!response.ok) {
    const error = await readProviderError(response);
    throw providerHttpError("meta_cloud_api", response.status, error.code, error.message);
  }

  const payload = await response.json() as {
    messages?: Array<{ id?: string }>;
  };
  const providerMessageId = payload.messages?.[0]?.id;
  if (!providerMessageId) {
    throw new ProviderAdapterError({
      provider: "meta_cloud_api",
      message: "Meta accepted the request but returned no message identifier.",
      code: "invalid_provider_response",
      retryable: false,
    });
  }

  return {
    provider: "meta_cloud_api",
    providerMessageId,
    acceptedAt: new Date().toISOString(),
  };
}

export async function sendWhatsAppTemplate(
  input: z.input<typeof templateInputSchema>,
  options: { config?: Partial<MetaWhatsAppConfig>; fetchImpl?: FetchLike } = {},
): Promise<WhatsAppSendResult> {
  const parsed = templateInputSchema.parse(input);
  const config = getConfig(options.config);
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: parsed.to.replace("+", ""),
        type: "template",
        template: {
          name: parsed.name,
          language: { code: parsed.languageCode },
          ...(parsed.components ? { components: parsed.components } : {}),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ProviderAdapterError({
      provider: "meta_cloud_api",
      message: "Meta WhatsApp template request failed before a response was received.",
      code: "network_error",
      retryable: true,
    });
  }

  if (!response.ok) {
    const error = await readProviderError(response);
    throw providerHttpError("meta_cloud_api", response.status, error.code, error.message);
  }

  const payload = await response.json() as { messages?: Array<{ id?: string }> };
  const providerMessageId = payload.messages?.[0]?.id;
  if (!providerMessageId) {
    throw new ProviderAdapterError({
      provider: "meta_cloud_api",
      message: "Meta accepted the template request but returned no message identifier.",
      code: "invalid_provider_response",
    });
  }
  return { provider: "meta_cloud_api", providerMessageId, acceptedAt: new Date().toISOString() };
}
