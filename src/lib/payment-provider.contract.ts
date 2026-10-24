/**
 * Provider-neutral payment contract for StayNas.
 *
 * Provider adapters must never infer a property from a global/default config.
 * Callers resolve an enabled integration for the booking's property first and
 * pass that immutable context to the adapter.
 */
export type PaymentEnvironment = "sandbox" | "live";
export type PaymentMethodCapability = "card" | "mobile_money" | "bank_transfer" | "wallet";

export type TenantPaymentContext = {
  propertyId: string;
  integrationId: string;
  provider: string;
  environment: PaymentEnvironment;
  currency: string;
  callbackBaseUrl: string;
  /** Secret values are resolved server-side from credential_reference only. */
  credentials: Readonly<Record<string, string>>;
  publicConfig: Readonly<Record<string, unknown>>;
};

export type PaymentIntentRequest = {
  bookingId: string;
  bookingReference: string;
  merchantReference: string;
  amount: number;
  currency: string;
  description: string;
  guest: {
    email: string;
    phone?: string | null;
    firstName?: string;
    lastName?: string;
    countryCode?: string;
  };
  returnUrl: string;
  callbackUrl: string;
  metadata?: Readonly<Record<string, string>>;
};

export type PaymentIntentResult = {
  provider: string;
  providerTransactionId: string;
  merchantReference: string;
  status: "pending" | "completed" | "failed";
  checkoutUrl?: string;
  instructions?: {
    kind: "mobile_money" | "bank_transfer" | "manual";
    message: string;
    reference?: string;
    expiresAt?: string;
  };
  amount: number;
  currency: string;
  raw?: unknown;
};

export type ProviderTransactionStatus = {
  provider: string;
  providerTransactionId: string;
  merchantReference: string | null;
  status: "pending" | "completed" | "failed" | "reversed" | "unknown";
  amount: number | null;
  currency: string | null;
  paymentMethod: string | null;
  providerReference?: string | null;
  raw?: unknown;
};

export type PaymentProviderCapabilities = {
  methods: readonly PaymentMethodCapability[];
  environments: readonly PaymentEnvironment[];
  supportsStatusCheck: boolean;
  supportsRefunds: boolean;
  supportsWebhook: boolean;
};

export interface PaymentProviderAdapter {
  readonly provider: string;
  readonly capabilities: PaymentProviderCapabilities;
  createIntent(context: TenantPaymentContext, request: PaymentIntentRequest): Promise<PaymentIntentResult>;
  getStatus(context: TenantPaymentContext, providerTransactionId: string): Promise<ProviderTransactionStatus>;
  verifyWebhook?(context: TenantPaymentContext, request: Request): Promise<ProviderTransactionStatus>;
  refund?(context: TenantPaymentContext, providerTransactionId: string, amount?: number): Promise<{ accepted: boolean; providerReference?: string }>;
}

/**
 * Mobile-money is a payment-method contract, not a single vendor. Concrete
 * adapters (e.g. a locally supported aggregator or a telco API) implement the
 * same provider interface and declare their own credential/config requirements.
 * Do not collect mobile-money PINs or OTPs in StayNas.
 */
export type MobileMoneyProviderContract = PaymentProviderAdapter & {
  readonly capabilities: PaymentProviderCapabilities & {
    methods: readonly ["mobile_money", ...PaymentMethodCapability[]] | readonly PaymentMethodCapability[];
  };
};

export function assertPaymentAmount(amount: number, currency: string): void {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be positive");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Payment currency must be a three-letter ISO code");
}
