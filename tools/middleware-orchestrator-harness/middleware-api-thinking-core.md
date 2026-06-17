# Middleware/API Thinking Core

## Purpose

Provide contract-first reasoning for middleware, API, integration, gateway, BFF, adapter, connector, webhook, event-driven, batch, stream, and agent-ready API wrapper systems.

## Interface styles

| Style | Contract evidence | Use when | Key gates |
|---|---|---|---|
| REST/HTTP | OpenAPI or equivalent | Resource-oriented HTTP APIs | paths, methods, auth, errors, pagination, idempotency |
| AsyncAPI/message-driven | AsyncAPI or equivalent event contract | Brokered events, pub/sub, streams | channel, operation, message schema, ordering, replay, DLQ |
| GraphQL | GraphQL schema/SDL | Client-selected graph queries/mutations | schema ownership, resolver authz, depth/cost limits |
| gRPC | Protobuf service definitions | Typed RPC, streaming, internal service APIs | proto compatibility, deadlines, status codes, metadata |
| Webhooks | OpenAPI callback or webhook contract plus event schema | External push events | signature, timestamp, dedupe, idempotency, retry, DLQ |
| Batch | File schema, manifest, schedule, reconciliation rules | Bulk transfer or scheduled sync | validation, partial failure, replay, audit |
| Streams | Topic schema, consumer group, offset model | High-volume ordered/partitioned events | partitioning, ordering, backpressure, replay, schema evolution |

## Architecture patterns

- **Gateway**: Policy enforcement and routing boundary for external or cross-team APIs.
- **BFF**: Client-specific backend that adapts internal services to a frontend or channel.
- **Adapter**: Translates protocol, data shape, or vendor-specific semantics.
- **Connector**: Encapsulates an external system integration with auth, retries, pagination, and error mapping.
- **Anti-Corruption Layer**: Prevents external or legacy domain models from leaking into core domain logic.
- **Orchestration**: Central workflow controls calls and state transitions.
- **Choreography**: Services react to events without a central orchestrator.
- **CQRS**: Separate write command model from read/query model when justified by scale, consistency, or domain complexity.
- **Agent-ready API wrapper**: Narrows a larger API surface into safe, typed, least-privilege tools for LLM agents.

## Orchestration vs choreography

Use orchestration when:

- There is a clear process owner.
- Compensation and state transitions need central control.
- Humans need a single operational view.

Use choreography when:

- Event ownership is decentralized.
- Producers should not know downstream consumers.
- New consumers need to subscribe without changing the producer.

Record trade-offs: coupling, observability, replay, ownership, failure recovery, and testability.

## Webhook ingestion pipeline

Use this canonical flow:

```text
receive -> verify signature -> validate schema -> dedupe/idempotency -> enqueue -> process -> persist -> observe -> DLQ
```

### Required decisions

- Provider identity and signature algorithm.
- Timestamp tolerance and replay window.
- Event schema and versioning.
- Idempotency key or dedupe key.
- Queue and retry policy.
- Processing side effects and transaction boundary.
- Persistence model for raw event and processed state.
- Observability: correlation ID, event ID, provider ID, error type, latency, retry count.
- Dead-letter queue and replay process.

## Security gates

- Authn mechanism: OAuth/OIDC, JWT, API key, mTLS, signed webhook, session, or internal identity.
- Authz model: object-level, property-level, function-level, tenant-level.
- Input validation: schema, size, content-type, canonicalization.
- Secrets: never hardcode; never echo in examples or logs.
- Rate/resource controls: limits, quotas, cost controls, circuit breakers.
- Audit: who did what, on which object, through which client, with which decision.

Security options are context-dependent. DPoP, mTLS, JWT confirmation, and sender-constrained tokens are options for specific threat models, not default requirements for every API.

## Reliability gates

- Timeouts and deadlines.
- Retry policy by operation type.
- Idempotency for retried writes.
- Backpressure and queue limits.
- Circuit breakers and bulkheads.
- Dead-letter queues and replay.
- Ordering and partitioning for events.
- Schema evolution and compatibility.
- Compensation and reconciliation.

## Observability gates

- Correlation ID and trace propagation.
- Structured logs with redaction.
- Metrics for throughput, latency, failures, retry count, queue depth, DLQ size.
- Distributed traces for cross-service flows.
- Dashboards and alerts aligned with SLOs.
- Runbook links for known failure classes.

## Contract testing

Minimum test classes:

- Contract/schema validation.
- Negative auth/authz tests.
- Idempotency tests for repeated writes/events.
- Retry and timeout behavior tests.
- Replay and DLQ tests for event flows.
- Consumer-driven or compatibility tests when multiple teams consume the contract.

## No endpoint invention rule

If no contract, code, logs, trace, HAR/cURL, or explicit user-provided API example exists, do not assert endpoint behavior. Produce a required contract inventory instead.
