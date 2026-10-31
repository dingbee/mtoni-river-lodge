import { z } from "zod";

export class ProviderAdapterError extends Error {
  readonly provider: "meta_cloud_api" | "resend";
  readonly status: number | null;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(args: {
    provider: "meta_cloud_api" | "resend";
    message: string;
    status?: number | null;
    code?: string | null;
    retryable?: boolean;
  }) {
    super(args.message);
    this.name = "ProviderAdapterError";
    this.provider = args.provider;
    this.status = args.status ?? null;
    this.code = args.code ?? null;
    this.retryable = args.retryable ?? false;
  }
}

export function providerHttpError(
  provider: "meta_cloud_api" | "resend",
  status: number,
  code: string | null,
  message: string,
): ProviderAdapterError {
  return new ProviderAdapterError({
    provider,
    status,
    code,
    message,
    retryable: status === 408 || status === 425 || status === 429 || status >= 500,
  });
}

export async function readProviderError(response: Response): Promise<{ code: string | null; message: string }> {
  const fallback = `Provider request failed with HTTP ${response.status}.`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const value = body as Record<string, unknown>;
      const nested = value.error && typeof value.error === "object"
        ? value.error as Record<string, unknown>
        : value;
      const code = nested.code;
      const message = nested.message ?? nested.name;
      return {
        code: typeof code === "string" || typeof code === "number" ? String(code) : null,
        message: typeof message === "string" ? message.slice(0, 500) : fallback,
      };
    }
  } catch {
    // Do not expose provider response bodies or credentials in error messages.
  }
  return { code: null, message: fallback };
}

export function requireServerSecret(value: string | undefined, name: string, provider: "meta_cloud_api" | "resend"): string {
  if (!value || !value.trim()) {
    throw new ProviderAdapterError({
      provider,
      message: `Missing server configuration: ${name}.`,
      code: "provider_not_configured",
      retryable: false,
    });
  }
  return value.trim();
}

export const providerIdempotencyKeySchema = z.string().min(16).max(200).regex(/^[A-Za-z0-9._:-]+$/);
