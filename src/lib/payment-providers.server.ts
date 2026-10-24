import { registerPaymentProvider, listPaymentProviders } from "./payment-provider-registry.server";
import { pesapalAdapter } from "./payment-providers/pesapal.adapter.server";

// Registration is explicit and server-only. Additional providers are registered
// here only when their adapter and sandbox/isolation tests are present.
registerPaymentProvider(pesapalAdapter);

export { listPaymentProviders };
export { getPaymentProvider } from "./payment-provider-registry.server";
export { pesapalAdapter } from "./payment-providers/pesapal.adapter.server";
