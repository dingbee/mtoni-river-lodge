# StayNas DC-04 â€” Provider-Neutral Adapter Runtime

Status: DC-04.1â€“04.4 contract implementation complete; DC-04.5 readiness review BLOCKED pending platform prerequisites and current-head CI. No provider activation is permitted. No provider connection, credential write, database migration, or deployment is authorised by this artifact.

## Objective

Establish the provider-neutral runtime boundary through which StayNas can register, validate, invoke, observe, and retire external distribution adapters without making any provider mandatory.

StayNas remains the system of record for property inventory, internal rate plans, reservations, and booking lifecycle. Adapters translate between external provider contracts and StayNas canonical contracts; they do not become an independent inventory or reservation authority.

## Scope

1. Adapter registry and provider identity.
2. Capability contracts and capability negotiation.
3. Adapter lifecycle and version compatibility.
4. Authentication/credential-reference abstraction.
5. Normalized errors and retry classification.
6. Connection health and capability-level readiness.
7. Contract tests with mock adapters.

## Explicit exclusions

- No Airbnb, Channex, or other provider is compulsory.
- No live or sandbox provider account is created or connected in this phase.
- No credentials or tokens are collected, persisted, rotated, or exposed.
- No live listing, availability, rate, reservation, or webhook synchronization.
- No changes to exi¶»§q«^