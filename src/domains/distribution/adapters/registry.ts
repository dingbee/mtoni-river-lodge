import {
  AdapterContractError,
  validateAdapterManifest,
  type DistributionAdapter,
  type DistributionCapability,
  type DistributionEnvironment,
} from "./contracts";

export type AdapterContractPolicy = Readonly<{
  supportedContractVersions: readonly string[];
}>;

/** In-memory registry only. It is not a connection store or an authorization boundary. */
export class DistributionAdapterRegistry {
  private readonly adapters = new Map<string, DistributionAdapter>();

  constructor(private readonly policy: AdapterContractPolicy) {}

  register(adapter: DistributionAdapter): void {
    const manifest = validateAdapterManifest(adapter.manifest);
    if (!this.policy.supportedContractVersions.includes(manifest.contractVersion)) {
      throw new AdapterContractError(
        "incompatible_contract",
        `Adapter contract version ${manifest.contractVersion} is not supported.`,
      );
    }
    if (manifest.capabilities.includes("connection.health") && !adapter.healthCheck) {
      throw new AdapterContractError(
        "invalid_manifest",
        "Adapter declares connection.health but has no healthCheck implementation.",
      );
    }
    const key = this.key(manifest.providerKey, manifest.adapterVersion);
    if (this.adapters.has(key)) {
      throw new AdapterContractError("duplicate_adapter", "Adapter provider/version is already registered.");
    }
    this.adapters.set(key, adapter);
  }

  resolve(providerKey: string, adapterVersion: string): DistributionAdapter {
    const adapter = this.adapters.get(this.key(providerKey, adapterVersion));
    if (!adapter) {
      throw new AdapterContractError("adapter_not_found", "No adapter is registered for the requested provider/version.");
    }
    return adapter;
  }

  assertCapability(
    providerKey: string,
    adapterVersion: string,
    capability: DistributionCapability,
    environment: DistributionEnvironment,
  ): DistributionAdapter {
    const adapter = this.resolve(providerKey, adapterVersion);
    if (!adapter.manifest.capabilities.includes(capability)) {
      throw new AdapterContractError("unsupported_capability", "Adapter does not declare the requested capability.");
    }
    if (!adapter.manifest.environments.includes(environment)) {
      throw new AdapterContractError("unsupported_capability", "Adapter does not support the requested environment.");
    }
    return adapter;
  }

  list(): readonly DistributionAdapter[] {
    return [...this.adapters.values()];
  }

  private key(providerKey: string, adapterVersion: string): string {
    return `${providerKey}@${adapterVersion}`;
  }
}
