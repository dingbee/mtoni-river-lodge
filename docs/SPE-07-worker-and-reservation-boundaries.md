# SPE-07 worker and canonical reservation boundaries

## Outbox worker
The server-only batch runner claims leased outbox records, resolves a provider adapter and tenant/property-scoped context, validates capability and payload contracts, dispatches publication operations, and records delivered/retry/dead-letter outcomes against the lease token. A stale lease cannot acknowledge work. Provider errors are reduced to safe codes/messages before persistence. The runner is dependency-injected so the scheduler, vault resolver, database loader and adapter registry remain deployment-specific.

Only rates, availability and restrictions are handled by this worker. Connection validation, polling, reconciliation and reservation lifecycle operations require dedicated workflows and are not silently treated as successful publication.

## Reservation lifecycle
Inbound events are validated and routed to an injected canonical SPE-06 writer. Create and modify commands carry the provider-confirmed amount, currency, tax, fee, commission and payment status as an external commercial commitment; they never substitute StayNas public pricing. Cancellations use the canonical cancellation command. Missing confirmed price is routed to manual review.

The canonical writer is deliberately an interface until the SPE-06 command contract and its acceptance gates are verified. No direct writes to `bookings`, no second booking lifecycle, and no production ingestion are permitted at this stage.

## Deferred physical configuration
Credential vault provisioning, encryption and rotation are deferred for physical configuration testing. The worker accepts only a server-resolved provider context; no browser path or database query may return credential material. No provider adapter or live connection is activated by this change.
