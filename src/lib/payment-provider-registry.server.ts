import type { PaymentProviderAdapter } from "./payment-provider.contract";

/** Explicit registry; adding a provider requires an adapter and provider-specific tests. */
const adapters = new Map<string, PaymentProviderAdapter>();

export function registerPaymentProvider(adapter: PaymentProviderAdapter): void {
  const key = adapter.provider.trim().toLowerCase();
  if (!key) throw new Error("Payment provider identifier is required");
  if (adapters.has(key)) throw new Error(`Payment provider already registered: ${key}`);
  adapters.set(key, adapter);
}

export function getPaymentProvider(provider: string): PaymentProviderAdapter {
  const adapter = adapters.get(provider.trim().toLowerCase());
  if (!adapter) throw new Error(`Unsupported payment provider: ${provider}`);
  return adapter;
}

export function listPaymentProviders(): Array<{
  provider: string;
  capabilities: PaymentProviderAdapter["capabilities"];
}> {
  return [...adapters.values()].map(({ provider, capabilities }) => ({ provider, capabilities }));
}
