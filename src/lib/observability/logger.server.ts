// Server-only structured logger and error capture.
// Emits JSON lines to console and persists errors to `system_errors` via service role.
// Never throws — logging must not break the primary code path.

type Severity = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogFields {
  module?: string;
  fn?: string;
  event?: string;
  requestId?: string | null;
  userId?: string | null;
  durationMs?: number;
  [k: string]: unknown;
}

function emit(level: Severity, message: string, fields: LogFields = {}) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...fields,
    });
    // eslint-disable-next-line no-console
    (level === "error" || level === "fatal" ? console.error : level === "warn" ? console.warn : console.log)(line);
  } catch {
    /* noop */
  }
}

export const logger = {
  debug: (msg: string, f?: LogFields) => emit("debug", msg, f),
  info: (msg: string, f?: LogFields) => emit("info", msg, f),
  warn: (msg: string, f?: LogFields) => emit("warn", msg, f),
  error: (msg: string, f?: LogFields) => emit("error", msg, f),
  fatal: (msg: string, f?: LogFields) => emit("fatal", msg, f),
};

export interface CaptureErrorInput {
  error: unknown;
  module?: string;
  fn?: string;
  severity?: Severity;
  source?: string; // "server-fn" | "server-route" | "cron" | "background"
  requestId?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
}

/**
 * Persist an error to `system_errors`. Best-effort; swallows internal failures.
 * Uses supabaseAdmin (service role) so it works even when the caller has no session.
 */
export async function captureError(input: CaptureErrorInput): Promise<void> {
  const err = input.error;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const stack = err instanceof Error ? err.stack ?? null : null;

  // Always log to stdout so it lands in worker logs even if DB insert fails.
  logger.error(message, {
    module: input.module,
    fn: input.fn,
    requestId: input.requestId ?? undefined,
    userId: input.userId ?? undefined,
    ...(input.context ?? {}),
  });

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("system_errors").insert({
      severity: input.severity ?? "error",
      source: input.source ?? "server-fn",
      module: input.module ?? null,
      function_name: input.fn ?? null,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000) ?? null,
      context: (input.context ?? {}) as Record<string, unknown>,
      request_id: input.requestId ?? null,
      user_id: input.userId ?? null,
    });
  } catch (e) {
    logger.warn("captureError: persist failed", { error: (e as Error).message });
  }
}

/**
 * Wrap a server-fn handler body. Times the run, captures thrown errors, then rethrows.
 * Usage:
 *   .handler(async (ctx) => withCapture({ module: "cms", fn: "publishPage" }, () => body(ctx)))
 */
export async function withCapture<T>(
  meta: { module: string; fn: string; userId?: string | null; requestId?: string | null },
  work: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await work();
    logger.info("ok", { module: meta.module, fn: meta.fn, durationMs: Date.now() - started });
    return result;
  } catch (err) {
    await captureError({
      error: err,
      module: meta.module,
      fn: meta.fn,
      userId: meta.userId ?? null,
      requestId: meta.requestId ?? null,
      context: { durationMs: Date.now() - started },
    });
    throw err;
  }
}