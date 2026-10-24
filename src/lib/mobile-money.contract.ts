/**
 * Stable contract for tenant-selectable mobile-money integrations.
 * Each concrete provider adapter owns its API format, credential schema,
 * status mapping and webhook verification. No provider is globally assumed.
 */
import type {
  MobileMoneyProviderContract,
  PaymentIntentRequest,
  PaymentIntentResult,
  ProviderTransactionStatus,
  TenantPaymentContext,
} from "./payment-provider.contract";

export type MobileMoneyCheckoutRequest = PaymentIntentRequest & {
  guest: PaymentIntentRequest["guest"] & { phone: string };
  preferredNetwork?: string;
};

export interface MobileMoneyAdapter extends Omit<MobileMoneyProviderContract, "createIntent"> {
  createMobileMoneyIntent(
    context: TenantPaymentContext,
    request: MobileMoneyCheckoutRequest,
  ): Promise<PaymentIntentResult>;
  getStatus(context: TenantPaymentContext, providerTransactionId: string): Promise<ProviderTransactionStatus>;
}
