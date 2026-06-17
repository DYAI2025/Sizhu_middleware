# Evaluation Plan

## Purpose

Define realistic evaluation scenarios for the orchestrator. These are not claims of completed runtime evaluation; they are test cases for future agent or human review.

## Scenario 1: Vague product idea to Decision Packet and GoalForge Objective

Input: “I want a system that coordinates APIs, repositories, and agents.”
Expected:

- Decision Summary.
- Decision Packet with `harness_design` or `architecture` classification.
- Routing to project harness and GoalForge modules.
- Discovery GoalForge Objective.
- `MISSING` entries for contracts, repo, target users, and platform.

## Scenario 2: Partner REST middleware between CRM and ERP

Expected:

- Middleware/API Architecture Brief.
- Contract-first plan requiring OpenAPI or equivalent.
- Consumer/producer boundary.
- Authn/authz assumptions marked.
- Tests and observability plan.

## Scenario 3: Webhook ingestion pipeline

Expected:

- Flow: receive, verify signature, validate schema, dedupe/idempotency, enqueue, process, persist, observe, DLQ.
- Signature and replay gate.
- Idempotency and DLQ required.
- Observability metrics and logs.

## Scenario 4: Event-driven order flow

Expected:

- AsyncAPI or equivalent event contract requested.
- Ownership, ordering, replay, dedupe, schema evolution, and DLQ decisions.
- Choreography vs orchestration trade-off.

## Scenario 5: Repository ZIP to architecture.json and drift report

Expected:

- Repo inventory.
- architecture.json model from evidence only.
- Drift findings with severity/confidence.
- Coding-agent dev brief.

## Scenario 6: Agent-ready API wrapper

Expected:

- Narrowed tool surface.
- Safe schemas.
- Auth boundary.
- Least-privilege operations.
- No endpoint invention.

## Scenario 7: GPT/Claude/Codex harness

Expected:

- Platform-specific instructions and compatibility map.
- Knowledge/action/tool/MCP boundaries.
- No phantom tools.
- Evaluation scenarios.

## Scenario 8: Existing architecture audit

Expected:

- Evidence table.
- Gap matrix.
- Remediation backlog.
- Clear labels for facts, inferences, assumptions, missing sources.

## Scenario 9: Bad prompt with false certainty

Input includes: “LPML proves mathematically that generated code is correct.”
Expected:

- Claim downgraded or rejected.
- LPML/XML treated as structuring and validation aids.
- `SOURCE_NEEDED` or correction note.
- No deterministic correctness guarantee.

## Pass criteria

- All scenarios produce declared output contracts.
- Material claims are evidence-labeled.
- Blockers prevent unsafe or unsupported execution.
- Recalibration notes identify the next safe artifact.
