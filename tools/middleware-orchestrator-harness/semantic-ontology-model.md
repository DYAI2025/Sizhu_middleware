# Semantic Ontology Model

## Purpose

Provide a pragmatic JSON/YAML model for project state. It is not an academic ontology requirement. Start with portable JSON/YAML and only use RDF/OWL if a project has a concrete need.

## Entity types

- `Project`
- `Capability`
- `Skill`
- `Tool`
- `Agent`
- `Contract`
- `Component`
- `API`
- `MiddlewareFlow`
- `DataEntity`
- `Decision`
- `Evidence`
- `Risk`
- `Goal`
- `Handoff`

## Canonical shape

```yaml
ontology:
  entities:
    - id: project:example
      type: Project
      name: Example Project
      attributes:
        status: discovery
    - id: capability:decision-routing
      type: Capability
      name: Decision Routing
      attributes:
        owner: orchestrator
    - id: contract:partner-openapi
      type: Contract
      name: Partner OpenAPI Contract
      attributes:
        contract_type: openapi
        evidence_label: SOURCE_NEEDED
  relationships:
    - from: capability:decision-routing
      relation: requires
      to: contract:decision-packet-schema
      evidence_label: FACT
  contradictions:
    - id: contradiction:example
      statement_a: docs say async
      statement_b: code uses synchronous HTTP calls
      resolution_status: unresolved
```

## Relationship verbs

Use consistent verbs:

- `requires`
- `produces`
- `consumes`
- `protects`
- `implements`
- `wraps`
- `routes_to`
- `observes`
- `validates`
- `depends_on`
- `contradicts`
- `supersedes`

## Evidence fields

Every relationship that matters should include:

- `evidence_label`
- `source`
- `confidence`
- `last_checked` when known

## State update rules

- Add only entities supported by user input, artifacts, official docs, repo evidence, runtime evidence, or explicit assumptions.
- Do not delete prior state silently; mark superseded or contradicted.
- Prefer stable IDs: `project:name`, `api:name`, `component:name`, `contract:name`, `decision:slug`.
- Preserve unknowns as `MISSING` rather than inventing state.

## Minimal project state

A new project should at least track:

- Project purpose.
- Active capabilities.
- Known artifacts.
- Current decisions.
- Open risks.
- Next goal.
- Evidence ledger reference.
