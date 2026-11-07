import type { CC04_PAYMENT_PROVIDERS } from "./settlement-contract";

export type CommercialPaymentProvider = (typeof CC04_PAYMENT_PROVIDERS)[number]
  | "airtel_money" | "mixx_by_yas" | "mpesa" | "halopesa";

export interface CommercialPaymentInitiation {
  paymentId: string;
  providerAccountId: string;
  amountMinor: number;
  currency: "TZS" | "USD";
  callbackUrl: string;
  customer: { email: string; phone?: string | null; firstName: string; lastName: string };
}
export interface CommercialProviderSettlement {
  providerOrderRef: string;
  providerTransactionRef: string;
  amountMinor: number;
  currency: "TZS" | "USD";
  status: "pending" | "successful" | "failed" | "cancelled" | "reversed";
  verifiedAt: string;
}
export interface CommercialPaymentProviderAdapter {
  readonly provider: CommercialPaymentProvider;
  initiate(input: CommercialPaymentInitiation): Promise<{ providerOrderRef: string; redirectUrl?: string }>;
  query(providerOrderRef: string, providerAccountId: string): Promise<CommercialProviderSettlement>;
}

/** Registry is explicit: an unimplemented provider fails closed rather than guessing an API contract. */
export class CommercialPaymentAdapterRegistry {
  private readonly adapters = new Map<CommercialPaymentProvider, CommercialPaymentProviderAdapter>();

  register(adapter: CommercialPaymentProviderAdapter) {
    if (this.adapters.has(adapter.provider)) throw new Error(`Adapter already registered for ${adapter.provider}.`);
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: CommercialPaymentProvider) {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`No approved live adapter is registered for ${provider}.`);
    return adapter;
  }

  supports(provider: CommercialPaymentProvider) {
    return this.adapters.has(provider);
  }
}
