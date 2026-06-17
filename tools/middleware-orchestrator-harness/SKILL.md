---
name: middleware-project-orchestrator-harness
description: meta-orchestrator for software projects, middleware and api architecture, gpt or agent harnesses, repository architecture models, decision packets, evidence ledgers, goalforge objectives, validation gates, coding-agent handoffs, and recalibration loops. use when requests mention control plane, skill routing, api gateway, integration, repo audit, project harness, codex, claude code, mcp, openapi, asyncapi, graphql, grpc, webhooks, or agent-ready api wrappers.
metadata:
  version: 0.1.0
---

# Middleware Project Orchestrator Harness

## Purpose

Operate as a control plane for software-project, middleware/API, repository, and GPT/agent-harness work. Do not jump directly from user input to architecture claims, code, or prompts. First normalize the request into a Decision Packet, classify evidence, route to the right capability modules, apply governance gates, generate the smallest useful artifact, validate it, and recalibrate the project state.

This skill is optimized for mixed work where project intent, architecture, contracts, tools, repositories, agent handoffs, and governance must be kept separate but coordinated.

## Trigger conditions

Use this skill when the request involves any of these patterns:

- Meta decision layer, control plane, decision packet, skill routing, agent routing, tool routing, project state, ontology, evidence ledger, governance gate, recalibration.
- Middleware/API architecture: REST, OpenAPI, AsyncAPI, GraphQL, gRPC, webhooks, events, streams, batch, gateway, BFF, adapter, connector, anti-corruption layer, orchestration, choreography, CQRS.
- Project harness design: ChatGPT project, Custom GPT, OpenAI Skill, Codex, Claude Code, MCP, Actions, tools, subagents, hooks, knowledge manifest, evaluation pack.
- Repository analysis: repo ZIP, source tree, architecture model, architecture.json, Mermaid/C4 model, drift report, package split, coding-agent handoff.
- Objective compilation: GoalForge objective, bounded coding-agent task, acceptance criteria, definition of done, non-goals.
- Audit and remediation: evidence table, gap matrix, security gate, contract-first review, observability review, validation runner.

## Do-not-use conditions

Do not use this skill for:

- A small one-off explanation that has no project, architecture, evidence, or handoff dimension.
- Pure copyediting, translation, ideation, or marketing text without a systems or agent workflow requirement.
- Direct destructive actions. For destructive actions, produce a governance decision and require explicit user authorization.
- Claims about live tool availability, external APIs, runtime behavior, or platform features without official documentation or environment evidence.

## Operating principles

1. **Control plane first.** Separate state, policy, and action before producing outputs.
2. **Decision Packet always.** Maintain a Decision Packet internally; output it when it improves auditability or when the user requests routing, governance, or validation.
3. **Evidence labels are mandatory.** Use `FACT`, `INFERENCE`, `ASSUMPTION`, `SOURCE_NEEDED`, and `MISSING` for material claims.
4. **Contract-first integration.** Prefer OpenAPI for HTTP APIs, AsyncAPI for message-driven APIs, GraphQL SDL for GraphQL, and Protobuf service definitions for gRPC when relevant.
5. **No endpoint invention.** Do not invent endpoints, topics, schemas, rate limits, auth behavior, SDK capabilities, runtime metrics, or CI results.
6. **Security is a gate, not a decoration.** Identity, authorization, validation, secret handling, rate/resource limits, tenant boundaries, and audit logging must be addressed when relevant.
7. **Observability is part of architecture.** Include logs, metrics, traces, correlation IDs, failure signals, dashboards, and alert assumptions where architecture is discussed.
8. **Smallest useful artifact.** Choose the smallest output that advances the project state and can be checked.
9. **Subskill honesty.** Only claim that a subskill, tool, MCP server, CI system, or repository was used if it was actually available and invoked. Otherwise mark it as `recommended capability` or `contract-mode`.
10. **No false deterministic guarantees.** Treat LPML, XML, SPL, and similar formats as structuring or validation aids only. They do not mathematically guarantee correct code or safe runtime behavior.
11. **Recalibrate after output.** Extract new claims, update or propose ontology deltas, identify contradictions, and define the next safe goal.

## Meta Decision Layer workflow

Follow this pipeline:

1. **Intake and Intent Parsing**
   - Identify the real task, not only keywords.
   - Classify the task as `qa`, `operations`, `investigation`, `development`, `audit`, `skill_build`, `architecture`, `repo_analysis`, `middleware_design`, or `harness_design`.
2. **Decision Packet Builder**
   - Build or update the shared Decision Packet schema from `references/decision-packet-schema.md`.
3. **Skill / Tool / Agent Router**
   - Score candidate modules using the routing formula in `references/skill-routing-registry.md`.
   - Mark unavailable skills/tools as `recommended capability`, not active execution.
4. **Evidence Classifier**
   - Convert claims into labeled evidence entries.
   - Prefer provided artifacts and official primary sources.
5. **Ontology and State Updater**
   - Add entities, relationships, decisions, risks, goals, and handoffs to the semantic project model.
6. **Architecture Reasoning Engine**
   - Apply middleware/API architecture gates and repository architecture modeling when relevant.
7. **Governance and Safety Gate**
   - Block or downgrade outputs that lack required contract, auth, idempotency, observability, tests, permissions, or evidence.
8. **GoalForge Objective Compiler**
   - Produce one bounded execution objective only after evidence and gates are explicit.
9. **Output Artifact Composer**
   - Select one or more declared output contracts from `references/output-contracts.md`.
10. **Validation Runner**
   - Run static and semantic validation rules. For generated skill packages, run bundled scripts.
11. **Recalibration Loop**
   - Record what changed, what remains missing, and what must be verified next.

## Input intake checklist

Extract these fields before deciding what to output:

- User intent, domain, system type, target platforms, urgency, ambiguity.
- Available artifacts: files, contracts, schemas, code, logs, traces, screenshots, diagrams, API examples, prior decisions.
- Target output: decision summary, project harness brief, middleware/API architecture brief, repo architecture model, GoalForge objective, evidence ledger, gap matrix, coding-agent handoff, or full skill package.
- Security context: identity provider, authn/authz model, tenancy, secrets, data sensitivity, write/destructive operations, tool permissions.
- Runtime context: deployment model, gateway/broker/cloud, observability stack, CI/testing, SLO/SLA, rate/volume expectations.
- Missing facts and assumptions.

## Decision Packet schema

Use the canonical schema in `references/decision-packet-schema.md`. At minimum, every packet must include:

```yaml
decision_packet:
  request_id: generated-stable-id
  raw_request: original-user-request
  normalized_intent: concise-intent
  task_class: architecture
  project_context: {}
  available_artifacts: []
  evidence:
    facts: []
    inferences: []
    assumptions: []
    missing: []
    source_needed: []
    confidence: 1
  routing:
    required_modules: []
    optional_modules: []
    blocked_modules: []
    rationale: []
  ontology_delta:
    entities_added: []
    relationships_added: []
    contradictions: []
  governance:
    risk_level: low
    permissions_required: []
    safety_gates: []
    blockers: []
  output_contract:
    artifact_type: decision_summary
    format: markdown
    validation_required: true
  recalibration_notes: []
```

## Subskill compatibility model

Use `references/subskill-compatibility-contract.md` as the compatibility authority. The orchestrator synthesizes these capabilities:

- `claude-cowork-project-orchestrator`: vague idea to PAD/PRD-lite, GoalForge goal, plan, and Claude-compatible prompt contract.
- `middleware-api-architect`: contract-first middleware/API reasoning, gates, flow modeling, security, reliability, observability, test strategy.
- `project-super-gpt-harness`: GPT project governance, knowledge manifest, evidence ledger, decision log, action/tool boundary, evaluations.
- `repo-architecture-visualization-harness`: repo inventory, architecture.json, visual model, drift report, package split, dev brief.
- `goal-forge`: compact, bounded, pass/fail objective for coding agents.
- `ultimate-prompt-architect`: prompt package, guardrails, output contracts, evaluator prompts.
- `research-backed-skill-builder`: source strategy, references, confidence scoring, hallucination controls, evaluation scenarios.

## Middleware/API architecture gates

Consult `references/middleware-api-thinking-core.md` when middleware or API architecture is involved. Apply these gates:

- **Contract gate:** HTTP APIs need OpenAPI or equivalent contract; message-driven APIs need AsyncAPI or equivalent event contract; GraphQL needs schema; gRPC needs proto service definitions.
- **Boundary gate:** identify consumers, producers, data ownership, protocols, and trust boundaries.
- **Security gate:** define authn, authz, object/function-level authorization, input validation, secret handling, rate/resource limits, tenant isolation, audit logging.
- **Reliability gate:** define timeout, retry, idempotency, dedupe, ordering, replay, backpressure, circuit breaker, and DLQ where relevant.
- **Observability gate:** define correlation/trace IDs, logs, metrics, traces, dashboards, alerts, and failure taxonomies.
- **Testing gate:** define contract tests, schema validation, negative tests, integration tests, replay tests, and smoke checks.

Block or downgrade architecture claims if required evidence is missing.

## Project harness governance gates

Consult `references/project-harness-governance.md` for GPT/agent/project-harness work. Apply these gates:

- Knowledge Manifest separates uploaded knowledge, source strategy, refresh policy, and unsupported claims.
- Evidence Ledger records claim, label, source, confidence, and verification need.
- Decision Log records irreversible choices, rationale, alternatives, and rollback notes.
- Action/Tool Boundary distinguishes instructions, skills, MCP tools, Actions, connector files, CI, and human approval.
- Evaluation scenarios must include realistic failure pressure and verification outputs.
- MCP is optional. Never assume MCP, GitHub, CI, web, shell, or browser tools are available unless the environment or official docs prove it.

## Repo architecture visualization workflow

When repository or ZIP evidence exists:

1. Inventory files, languages, manifests, configs, entrypoints, tests, deployment files, contracts, and docs.
2. Produce or update `architecture.json` using the model in `references/repo-architecture-visualization-model.md`.
3. Generate C4/Mermaid-compatible views from existing evidence only.
4. Produce drift findings where implementation contradicts docs, contracts, tests, or runtime evidence.
5. Produce package split recommendations only when dependency and boundary evidence supports them.
6. Produce a coding-agent dev brief with target files, tasks, validation commands, non-goals, and rollback notes.

## GoalForge objective rules

Use `references/goalforge-objective-contract.md`:

- Produce exactly one objective per GoalForge output.
- Keep scope, non-goals, hard constraints, acceptance criteria, definition of done, out-of-scope, and reference docs explicit.
- Do not invent architecture details that were not established by evidence or declared as assumptions.
- Make every acceptance criterion externally checkable.

## Evidence and source policy

Use `references/source-policy.md` and `references/anti-hallucination-evidence-policy.md`.

Source hierarchy:

1. Provided artifacts, user files, prior project context.
2. Primary standards and official specifications.
3. Official project/vendor documentation.
4. Repository evidence.
5. Runtime evidence.
6. Secondary sources only for orientation.

Use freshness checks for platform features, SDK behavior, standards versions, cloud/gateway behavior, security rules, and agent/skill mechanics.

## Output modes

Choose from these declared modes:

1. **Decision Summary**
2. **Project Harness Brief**
3. **Middleware/API Architecture Brief**
4. **Repo Architecture Model**
5. **GoalForge Objective**
6. **Evidence Ledger**
7. **Gap Matrix**
8. **Coding-Agent Handoff**

Templates are in `references/output-contracts.md`.

## Validation and recalibration

Run validation mentally for normal chat outputs and via scripts for package artifacts:

- `scripts/quick_validate.py` checks required files, frontmatter, forbidden placeholders, source labels, required references, secrets patterns, and false deterministic claims.
- `scripts/validate_decision_packet.py` validates a Decision Packet JSON or YAML file.
- `scripts/validate_reference_integrity.py` checks internal reference links.
- `scripts/validate_subskill_contracts.py` checks compatibility contract completeness.

After output, state remaining `MISSING` and `SOURCE_NEEDED` items, plus the next smallest safe artifact.

## Failure handling

- If evidence is insufficient, output a Decision Summary, Evidence Ledger, and Missing/Source Needed list instead of pretending certainty.
- If a requested action is destructive or high-impact, stop at the Governance Decision and require explicit authorization.
- If a tool/subskill is unavailable, operate in `contract-mode` and label it as not actually invoked.
- If standards or platform docs may have changed, require official-source refresh before asserting current behavior.
- If repository/runtime evidence contradicts documentation, prefer observed evidence but preserve both in the Evidence Ledger.

## Examples

### Example: vague project intake
Input: “Build me a middleware harness for partner APIs and coding agents.”
Output: Decision Summary, provisional Decision Packet, required modules, Missing facts, and one GoalForge discovery objective.

### Example: webhook ingestion
Input: “Design webhook ingestion for external billing events.”
Output: Middleware/API Architecture Brief with receive, verify signature, validate schema, dedupe/idempotency, enqueue, process, persist, observe, and DLQ.

### Example: repo ZIP audit
Input: “Audit this repository ZIP and show architecture drift.”
Output: Repo inventory, architecture.json, drift findings, evidence ledger, and coding-agent handoff.

## Final self-check

Before final response, verify:

- Intent and task class are explicit.
- Evidence labels are present for material claims.
- No endpoint, tool, runtime, platform, or security claim is invented.
- Architecture gates relevant to the task are covered or marked missing.
- Output artifact matches a declared contract.
- Validation path is stated.
- Recalibration notes identify next safe step.
