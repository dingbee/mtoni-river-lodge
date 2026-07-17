// Client + server safe retry helper with exponential backoff and jitter.
// Used for external HTTP calls (email provider, PesaPal, AI Gateway) where
// transient failures should not surface as user-visible errors.

export interface RetryOptions {
  retries?: number;         // number of retry attempts after the first try (default 3)
  minDelayMs?: number;      // initial backoff (default 250)
  maxDelayMs?: number;      // cap between retries (default 4000)
  factor?: number;          // multiplier (default 2)
  jitter?: boolean;         // add ±25% jitter (default true)
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

const defaultShouldRetry = (err: unknown): boolean => {
  // Retry on network-ish errors and 5xx / 429; skip 4xx.
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(4\d\d)\b/.test(msg) && !/\b(408|425|429)\b/.test(msg)) return false;
  return true;
};

export async function withRetry<T>(work: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const minDelayMs = opts.minDelayMs ?? 250;
  const maxDelayMs = opts.maxDelayMs ?? 4000;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? true;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await work();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err, attempt)) throw err;
      const base = Math.min(maxDelayMs, minDelayMs * Math.pow(factor, attempt));
      const delay = jitter ? Math.round(base * (0.75 + Math.random() * 0.5)) : base;
      opts.onRetry?.(err, attempt + 1, delay);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
}