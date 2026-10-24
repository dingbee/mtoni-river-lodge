import { registerPaymentProvider, listPaymentProviders } from "./payment-provider-registry.server";
import { pesapalAdapter } from "./payment-providers/pesapal.adapter.server";
import { payinAdapter } from "./payment-providers/payin.adapter.server";

// Registration is explicit and server-only. Provider activation remains tenant-scoped.
registerPaymentProvider(pesapalAdapter);
registerPaymentProvider(payinAdapter);

export { listPaymentProviders };
export { getPaymentProvider } from "./payment-provider-registry.server";
export { pesapalAdapter } from "./payment-providers/pesapal.adapter.server";
export { payinAdapter } from "./payment-providers/payin.adapter.server";
