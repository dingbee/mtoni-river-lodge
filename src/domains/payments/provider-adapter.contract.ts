export const STAYNAS_PAYMENT_PROVIDER_CODES = [
  "pesapal",
  "mpesa",
  "airtel_money",
  "mixx_by_yas",
  "halopesa",
  "bank_transfer",
  "manual",
] as const;

export type StayNasPaymentProvider = (typeof STAYNAS_PAYMENT_PROVIDER_CODES)[number];
export type StayNasPaymentScope = "platform_subscription" | "property_guest";
export type StayNasPaymentEnvironment = "sandbox" | "live";

export interface StayNasProviderConfiguration {
  configurationId: string;
  scope: StayNasPaymentScope;
  provider: StayNasPaymentProvider;
  accountReference: string;
  environment: StayNasPaymentEnvironment;
  supportedCurrencies: Array<"TZS" | "USD">;
  publicConfiguration: Record<string, unknown>;
}

export interface StayNasPaymentInitiation {
  paymentReference: string;
  amountMinor: number;
  currency: "TZS" | "USD";
  callbackUrl: string;
  customer: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface StayNasProviderSettlement {
  providerOrderReference: string;
  providerTransactionReference: string;
  amountMinor: number;
  currency: "TZS" | "USD";
  status: "pending" | "successful" | "failed" | "cancelled" | "reversed";
  verifiedAt: string;
  rawEvidence: Record<string, unknown>;
}

/**
 * Every provider implementation must satisfy the same lifecycle:
 * connectivity test, checkout initiation, authoritative status query and
 * webhook verification. Browser redirects and webhook payloads alone are
 * never settlement evidence.
 */
export interface StayNasPaymentProviderAdapter {
  readonly provider: StayNasPaymentProvider;
  readonly scope: StayNasPaymentScope;
  testConnection(configuration: StayNasProviderConfiguration, credentials: Record<string, unknown>): Promise<{
    ok: boolean;
    accountLabel?: string;
    message: string;
  }>;
  initiate(
    configuration: StayNasProviderConfiguration,
    credentials: Record<string, unknown>,
    input: StayNasPaymentInitiation,
  ): Promise<{ providerOrderReference: string; checkoutUrl?: string }>;
  query(
    configuration: StayNasProviderConfiguration,
    credentials: Record<string, unknown>,
    providerOrderReference: string,
  ): Promise<StayNasProviderSettlement>;
  verifyWebhook(
    configuration: StayNasProviderConfiguration,
    credentials: Record<string, unknown>,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<StayNasProviderSettlement>;
}

export class StayNasPaymentProviderRegistry {
  private readonly adapters = new Map<string, StayNasPaymentProviderAdapter>();

  register(adapter: StayNasPaymentProviderAdapter) {
    const key = `${adapter.scope}:${adapter.provider}`;
    if (this.adapters.has(key)) throw new Error(`A payment adapter is already registered for ${key}.`);
    this.adapters.set(key, adapter);
  }

  get(scope: StayNasPaymentScope, provider: StayNasPaymentProvider) {
    const adapter = this.adapters.get(`${scope}:${provider}`);
    if (!adapter) {
      throw new Error(`No certified ${scope} adapter is registered for ${provider}; this provider cannot be activated.`);
    }
    return adapter;
  }

  supports(scope: StayNasPaymentScope, provider: StayNasPaymentProvider) {
    return this.adapters.has(`${scope}:${provider}`);
  }

  readiness() {
    return STAYNAS_PAYMENT_PROVIDER_CODES.flatMap((provider) => ([
      {
        scope: "platform_subscription" as const,
        provider,
        ready: this.supports("platform_subscription", provider),
      },
      {
        scope: "property_guest" as const,
        provider,
        ready: this.supports("property_guest", provider),
      },
    ]));
  }
}


/** Provider identifiers supported by the current CC-04 subscription collection ledger. */
export type CommercialPlatformProvider = "pesapal" | "bank_transfer" | "manual";

export function commercialPlatformProvider(
  provider: StayNasPaymentProvider,
): CommercialPlatformProvider | null {
  return provider === "pesapal" || provider === "bank_transfer" || provider === "manual"
    ? provider
    : null;
}
