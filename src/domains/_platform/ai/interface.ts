/**
 * Sprint 5 · Mtoni AI Readiness contract.
 *
 * Every new domain module should expose an object built with `defineAiInterface()`
 * so future AI capabilities can be wired uniformly. Any subset of the five
 * verbs may be implemented; unimplemented verbs stay `undefined` and callers
 * feature-detect. Initial implementations may return deterministic placeholders.
 */

export type AiVerb = "summarize" | "suggest" | "analyze" | "predict" | "recommend";

export interface AiInterface<TInput = unknown, TOutput = unknown> {
  summarize?: (input: TInput) => Promise<TOutput>;
  suggest?: (input: TInput) => Promise<TOutput>;
  analyze?: (input: TInput) => Promise<TOutput>;
  predict?: (input: TInput) => Promise<TOutput>;
  recommend?: (input: TInput) => Promise<TOutput>;
}

export function defineAiInterface<TInput = unknown, TOutput = unknown>(
  impl: AiInterface<TInput, TOutput>,
): AiInterface<TInput, TOutput> {
  return impl;
}

/** Deterministic placeholder response — useful before real model calls exist. */
export function aiPlaceholder<T>(label: string, data?: T) {
  return {
    ok: true as const,
    placeholder: true as const,
    label,
    generatedAt: new Date().toISOString(),
    data: data ?? null,
  };
}