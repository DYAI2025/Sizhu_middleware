# Decision Packet Schema

## Purpose

A Decision Packet is the shared machine-readable handoff between intake, routing, evidence classification, ontology update, architecture reasoning, governance, output composition, validation, and recalibration.

## Canonical YAML shape

```yaml
decision_packet:
  request_id: stable-id
  raw_request: original user text or summary
  normalized_intent: concise intent
  task_class: qa
  project_context:
    domain: unknown
    system_type: mixed
    target_platforms: []
    current_state: unknown
  available_artifacts:
    - type: markdown
      name: artifact-name
      path_or_reference: supplied-reference
      evidence_label: FACT
  evidence:
    facts:
      - claim: claim directly supported by evidence
        source: source name
        confidence: 5
    inferences:
      - claim: logical derivation
        based_on: []
        confidence: 3
    assumptions:
      - claim: reversible assumption
        reason: why needed
        confidence: 2
    missing:
      - item: missing required fact
        blocks: []
    source_needed:
      - claim: claim needing external verification
        required_source_type: official-docs
    confidence: 3
  routing:
    required_modules:
      - id: middleware-api-thinking-core
        reason: contract-first API architecture required
    optional_modules: []
    blocked_modules: []
    rationale:
      - capability match and risk reduction justify route
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
  recalibration_notes:
    - record what changed and what remains uncertain
```

## Required values

`task_class` must be one of:

```text
qa, operations, investigation, development, audit, skill_build, architecture, repo_analysis, middleware_design, harness_design
```

`risk_level` must be one of:

```text
low, medium, high, blocked
```

`artifact_type` should be one of:

```text
decision_summary, project_harness_brief, middleware_api_architecture_brief, repo_architecture_model, goalforge_objective, evidence_ledger, gap_matrix, coding_agent_handoff, skill_package
```

## Evidence confidence

Use 1 to 5:

- `1`: weak, mostly missing or speculative.
- `2`: some evidence but key facts missing.
- `3`: adequate for provisional planning.
- `4`: strong but not runtime verified.
- `5`: direct primary, repository, or runtime evidence.

## Validation expectations

A valid Decision Packet must include:

- `decision_packet` root object.
- Non-empty `request_id`, `normalized_intent`, and `task_class`.
- `evidence` object with all five label arrays.
- `routing` object with required, optional, and blocked module lists.
- `governance` object with `risk_level`.
- `output_contract` object with artifact type, format, and validation flag.
