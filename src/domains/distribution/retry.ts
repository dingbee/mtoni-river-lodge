export interface RetryPolicy {
  maxAttempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  jitterRatio: number;
}

export const DEFAULT_DISTRIBUTION_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 8,
  baseDelaySeconds: 15,
  maxDelaySeconds: 3600,
  jitterRatio: 0.2,
};

export function calculateRetryDelaySeconds(
  attempt: number,
  policy: RetryPolicy = DEFAULT_DISTRIBUTION_RETRY_POLICY,
  randomValue = 0.5,
  retryAfterSeconds: number | null = null,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error("Retry attempt must be a positive integer.");
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue > 1) throw new Error("Random value must be between zero and one.");
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 ||
      !Number.isFinite(policy.baseDelaySeconds) || policy.baseDelaySeconds < 0 ||
      !Number.isFinite(policy.maxDelaySeconds) || policy.maxDelaySeconds < policy.baseDelaySeconds ||
      !Number.isFinite(policy.jitterRatio) || policy.jitterRatio < 0 || policy.jitterRatio > 1) {
    throw new Error("Retry policy is invalid.");
  }
  if (attempt >= policy.maxAttempts) throw new Error("Retry attempt limit reached; operation must be dead-lettered.");
  const exponential = Math.min(policy.maxDelaySeconds, policy.baseDelaySeconds * (2 ** (attempt - 1)));
  const jittered = exponential * (1 - policy.jitterRatio + (2 * policy.jitterRatio * randomValue));
  const providerDelay = retryAfterSeconds === null ? 0 : Math.max(0, retryAfterSeconds);
  return Math.ceil(Math.min(policy.maxDelaySeconds, Math.max(jittered, providerDelay)));
}

export function classifyProviderFailure(input: {
  retryable: boolean;
  attempt: number;
  policy?: RetryPolicy;
}): "retry" | "dead_letter" {
  const policy = input.policy ?? DEFAULT_DISTRIBUTION_RETRY_POLICY;
  return input.retryable && input.attempt < policy.maxAttempts ? "retry" : "dead_letter";
}
