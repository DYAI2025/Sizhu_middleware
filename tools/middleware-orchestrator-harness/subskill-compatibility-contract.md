# Subskill Compatibility Contract

## Purpose

Define how the orchestrator composes capabilities from peer skills without pretending that unavailable skills were actually invoked.

## Shared labels

All capability modules use the same claim labels:

- `FACT`
- `INFERENCE`
- `ASSUMPTION`
- `SOURCE_NEEDED`
- `MISSING`

## Shared input contract

Every module reads from the Decision Packet and may receive additional artifacts explicitly listed in `available_artifacts`.

## Shared output contract

Every module must return one or more declared artifacts from `references/output-contracts.md` or a named ontology delta.

## Compatibility contracts

### capability_id: claude-cowork-project-orchestrator

- purpose: Turn vague project/product/agent ideas into project intent, PAD/PRD-lite, objective, plan, and Claude-compatible prompt structure.
- trigger_conditions: Vague software idea, Claude Project, cowork workflow, project prompt, PAD/PRD-lite, plan-before-action.
- required_inputs: User intent, target platform, rough domain, desired output.
- accepted_evidence_types: User request, product notes, prior decisions, uploaded docs.
- output_artifacts: Project Harness Brief, GoalForge Objective, Coding-Agent Handoff, Claude-compatible prompt notes.
- state_changes: Adds Project, Goal, Decision, Risk, Handoff entities.
- governance_gates: No implementation without plan and permission; missing context becomes discovery mode.
- failure_modes: Over-compression, fake certainty, prompt too restrictive, missing output prompt.
- incompatible_modes: Direct destructive implementation; one-off answer with no project context.
- escalation_path: Mark `MISSING`, produce discovery objective, ask at most three blocking questions.

### capability_id: middleware-api-architect

- purpose: Design, audit, and plan middleware/API systems using contract-first architecture gates.
- trigger_conditions: API, middleware, gateway, BFF, adapter, connector, webhook, events, OpenAPI, AsyncAPI, GraphQL, gRPC.
- required_inputs: Consumers, producers, contracts, schemas or examples, auth model, flow, operational constraints.
- accepted_evidence_types: Contracts, code, logs, traces, diagrams, user requirements, official standards.
- output_artifacts: Middleware/API Architecture Brief, Gap Matrix, Evidence Ledger, Coding-Agent Handoff.
- state_changes: Adds API, Contract, Component, MiddlewareFlow, DataEntity, Risk, Decision entities.
- governance_gates: Contract, authz, idempotency, schema, observability, testing.
- failure_modes: Endpoint invention, missing auth, unbounded retries, event flow without DLQ/replay.
- incompatible_modes: Small snippet request without architecture dimension.
- escalation_path: Block implementation until missing contract/security/runtime evidence is supplied or assumptions are accepted.

### capability_id: project-super-gpt-harness

- purpose: Model GPT/agent project harness governance and separate knowledge, instructions, tools, actions, MCP, and evaluations.
- trigger_conditions: Custom GPT, ChatGPT Project, Skills, Actions, MCP, knowledge pack, harness, governance, evaluation.
- required_inputs: Target platform, knowledge files, tools/actions, project purpose, evaluation expectations.
- accepted_evidence_types: Uploaded docs, project instructions, tool manifests, official platform docs, eval scenarios.
- output_artifacts: Project Harness Brief, Evidence Ledger, Gap Matrix, evaluation plan.
- state_changes: Adds Skill, Tool, Agent, Contract, Evidence, Decision, Risk entities.
- governance_gates: No phantom tools; no unsupported platform claims; explicit action/tool boundary.
- failure_modes: Treating ZIPs as automatically invoked Skills, mixing knowledge and tools, missing evals.
- incompatible_modes: Pure API implementation without harness concerns.
- escalation_path: Mark optional capabilities as recommended; require official docs for platform mechanics.

### capability_id: repo-architecture-visualization-harness

- purpose: Convert repository or ZIP evidence into architecture inventory, architecture.json, visual guidance, drift report, and dev brief.
- trigger_conditions: Repository, ZIP, codebase, architecture.json, diagram, C4, Mermaid, drift, package split.
- required_inputs: Repository files or explicit architecture artifacts.
- accepted_evidence_types: Source tree, manifests, code, tests, docs, deployment files, contracts.
- output_artifacts: Repo Architecture Model, Gap Matrix, Coding-Agent Handoff.
- state_changes: Adds Component, API, Contract, MiddlewareFlow, Dependency, Decision, Risk entities.
- governance_gates: Do not infer runtime behavior from names alone; mark unsupported relationships as assumptions.
- failure_modes: Over-reading filenames, creating diagrams not supported by code, unverified dependency claims.
- incompatible_modes: No repository or architecture evidence.
- escalation_path: Produce inventory-only model and list missing evidence.

### capability_id: goal-forge

- purpose: Compile one compact, testable, bounded objective for implementation agents.
- trigger_conditions: Goal, objective, coding-agent task, implementation target, acceptance criteria.
- required_inputs: Intent, scope, constraints, evidence state, non-goals, validation path.
- accepted_evidence_types: Decision Packet, architecture brief, requirements, repo evidence.
- output_artifacts: GoalForge Objective.
- state_changes: Adds Goal and Handoff entities.
- governance_gates: No invented architecture details; one objective only; pass/fail criteria required.
- failure_modes: Scope creep, multiple objectives, vague acceptance criteria.
- incompatible_modes: Broad discovery before sufficient intent exists.
- escalation_path: Produce discovery objective with missing facts.

### capability_id: ultimate-prompt-architect

- purpose: Produce structured prompts, guardrails, evaluator prompts, and self-critique loops for LLM workflows.
- trigger_conditions: System prompt, superprompt, evaluator prompt, prompt package, XML control tags, guardrails.
- required_inputs: Role, task, context, constraints, output contract, failure modes.
- accepted_evidence_types: User prompt, platform docs, output contracts, evaluation results.
- output_artifacts: Project Harness Brief, Coding-Agent Handoff, evaluator prompt section.
- state_changes: Adds Agent, Prompt, Contract, Decision, Risk entities.
- governance_gates: No hidden chain-of-thought disclosure; no tool capability invention.
- failure_modes: Over-engineered prompt, false certainty, unsupported tool instructions.
- incompatible_modes: Pure architecture audit with no prompt deliverable.
- escalation_path: Produce minimal prompt contract and evaluation checklist.

### capability_id: research-backed-skill-builder

- purpose: Build or update Skill packages using source strategy, references, confidence scoring, hallucination controls, examples, and scripts.
- trigger_conditions: Build Skill, update Skill, package Skill, references, examples, validators, evaluation scenarios.
- required_inputs: Skill purpose, triggers, inputs, outputs, constraints, source materials.
- accepted_evidence_types: Uploaded docs, official docs, source map, existing skills, examples.
- output_artifacts: Skill package, Evidence Ledger, validation report, source register.
- state_changes: Adds Skill, Source, Contract, Evaluation, Decision entities.
- governance_gates: No fake sources; no unvalidated platform claims; no secrets; no placeholders.
- failure_modes: Knowledge dump, missing trigger description, unsupported validators, package fails validation.
- incompatible_modes: One-off answer without reusable workflow.
- escalation_path: Mark gaps as `SOURCE_NEEDED`, create minimal installable package, expose validation limits.

## Conflict resolution

Priority order:

1. Safety and governance gates.
2. Source policy and evidence labels.
3. User-provided constraints.
4. Platform compatibility constraints.
5. Architecture and middleware rules.
6. GoalForge compression.
7. Prompt style and formatting preferences.

## Unavailable capability rule

If a skill, tool, agent, or MCP server is not available in the runtime, do not claim execution. Use one of these labels:

- `recommended capability`: should be used if installed.
- `contract-mode`: local behavior follows the documented output contract, but the subskill was not invoked.
- `blocked`: required capability missing and no safe local substitute exists.
