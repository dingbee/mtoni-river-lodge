import type {
  DistributionAvailability,
  DistributionOperation,
  DistributionRate,
  DistributionRestriction,
  InboundReservationEvent,
  ProviderCapabilities,
} from "./contracts";

export interface ProviderContext {
  tenantId: string;
  propertyId: string;
  connectionId: string;
  externalAccountId: string;
  externalPropertyId: string;
  credentialReference: string;
  idempotencyKey: string;
  correlationId: string;
}

export interface ProviderResult {
  accepted: boolean;
  providerOperationId: string | null;
  providerRequestId: string | null;
  retryable: boolean;
  retryAfterSeconds: number | null;
  errorCode: string | null;
  safeMessage: string | null;
  acknowledgedAt: string;
}

export interface ProviderConnectionResult {
  connected: boolean;
  externalAccountId: string;
  externalPropertyId: string;
  checkedAt: string;
  errorCode: string | null;
  safeMessage: string | null;
}

export interface DistributionProviderAdapter {
  readonly id: string;
  discoverCapabilities(context: ProviderContext): Promise<ProviderCapabilities>;
  validateConnection(context: ProviderContext): Promise<ProviderConnectionResult>;
  pushRates?(context: ProviderContext, rates: DistributionRate[]): Promise<ProviderResult>;
  pushAvailability?(context: ProviderContext, inventory: DistributionAvailability[]): Promise<ProviderResult>;
  pushRestrictions?(context: ProviderContext, restrictions: DistributionRestriction[]): Promise<ProviderResult>;
  pullReservations?(context: ProviderContext, cursor: string | null): Promise<{
    events: InboundReservationEvent[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
  receiveReservation?(context: ProviderContext, event: InboundReservationEvent): Promise<ProviderResult>;
  modifyReservation?(context: ProviderContext, event: InboundReservationEvent): Promise<ProviderResult>;
  cancelReservation?(context: ProviderContext, event: InboundReservationEvent): Promise<ProviderResult>;
  acknowledgeReservation?(context: ProviderContext, eventId: string, accepted: boolean, safeReason?: string): Promise<ProviderResult>;
  reconcile?(context: ProviderContext, operationIds: string[]): Promise<ProviderResult[]>;
}

export class DistributionProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "DistributionProviderError";
  }
}

const operationMethod: Partial<Record<DistributionOperation, keyof DistributionProviderAdapter>> = {
  "connection.validate": "validateConnection",
  "rates.push": "pushRates",
  "availability.push": "pushAvailability",
  "restrictions.push": "pushRestrictions",
  "reservations.pull": "pullReservations",
  "reservations.receive": "receiveReservation",
  "reservations.modify": "modifyReservation",
  "reservations.cancel": "cancelReservation",
  "reconciliation.read": "reconcile",
};

/** Capability declarations and callable methods must agree; an adapter cannot advertise a missing operation. */
export function assertAdapterContract(adapter: DistributionProviderAdapter, capabilities: ProviderCapabilities): void {
  if (!adapter.id || adapter.id !== adapter.id.trim()) throw new Error("Provider adapter id is invalid.");
  for (const operation of capabilities.operations) {
    const method = operationMethod[operation];
    if (method && typeof adapter[method] !== "function") {
      throw new Error(`Provider ${adapter.id} advertises ${operation} without implementing its adapter method.`);
    }
  }
  if (capabilities.reservationDelivery === "polling" || capabilities.reservationDelivery === "both") {
    if (!capabilities.operations.includes("reservations.pull") || typeof adapter.pullReservations !== "function") {
      throw new Error("Polling delivery requires a reservation-pull capability and implementation.");
    }
  }
  if (capabilities.reservationDelivery === "webhook" || capabilities.reservationDelivery === "both") {
    if (!capabilities.operations.includes("reservations.receive") || typeof adapter.receiveReservation !== "function") {
      throw new Error("Webhook delivery requires a reservation-receive capability and implementation.");
    }
  }
}
