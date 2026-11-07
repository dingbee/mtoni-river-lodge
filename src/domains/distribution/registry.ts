import { providerCapabilitiesSchema, type ProviderCapabilities } from "./contracts";
import { assertAdapterContract, type DistributionProviderAdapter } from "./provider";

export class DistributionProviderRegistry {
  private readonly adapters = new Map<string, {
    adapter: DistributionProviderAdapter;
    capabilities: ProviderCapabilities;
  }>();

  register(adapter: DistributionProviderAdapter, rawCapabilities: unknown): void {
    const capabilities = providerCapabilitiesSchema.parse(rawCapabilities);
    assertAdapterContract(adapter, capabilities);
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Provider adapter "${adapter.id}" is already registered.`);
    }
    this.adapters.set(adapter.id, { adapter, capabilities });
  }

  get(providerId: string) {
    const entry = this.adapters.get(providerId);
    if (!entry) throw new Error(`Provider adapter "${providerId}" is not registered.`);
    return entry;
  }

  list(): Array<{ id: string; capabilities: ProviderCapabilities }> {
    return [...this.adapters.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, entry]) => ({ id, capabilities: entry.capabilities }));
  }
}
