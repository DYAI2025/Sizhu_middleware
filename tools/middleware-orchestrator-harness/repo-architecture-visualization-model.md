# Repo Architecture Visualization Model

## Purpose

Turn repository evidence into a canonical architecture model and visualization guidance without inventing runtime behavior.

## Repo inventory

Inspect:

- Directory tree.
- Package manifests and lockfiles.
- Main entrypoints.
- Source modules and bounded contexts.
- API contracts: OpenAPI, AsyncAPI, GraphQL SDL, proto files.
- Configuration: env examples, gateway config, broker config, deployment manifests.
- Tests and CI.
- Docs and diagrams.
- Scripts and infrastructure code.

## architecture.json canonical model

```json
{
  "schema_version": "0.1.0",
  "project": {
    "name": "example",
    "source": "repo evidence",
    "confidence": 3
  },
  "nodes": [
    {
      "id": "component:api-service",
      "type": "component",
      "name": "API Service",
      "technology": "source-derived",
      "evidence": ["path:src/api"],
      "confidence": 3
    }
  ],
  "edges": [
    {
      "from": "component:api-service",
      "to": "component:database",
      "relation": "depends_on",
      "evidence": ["path:src/api/config"],
      "confidence": 2
    }
  ],
  "runtime_flows": [
    {
      "id": "flow:request",
      "steps": [],
      "evidence": [],
      "confidence": 1
    }
  ],
  "contracts": [],
  "dependencies": [],
  "drift_findings": [],
  "visualization": {
    "c4_level": "container",
    "mermaid": "flowchart LR"
  }
}
```

## Node types

- system
- container
- component
- api
- contract
- datastore
- queue
- topic
- external-system
- agent
- tool
- ci-job
- deployment-unit

## Edge types

- calls
- publishes
- subscribes
- reads
- writes
- depends_on
- authenticates_with
- emits_telemetry_to
- deploys_to
- wraps
- validates_against

## Visualization outputs

Use C4-compatible abstraction where possible:

- System context: people, external systems, target system.
- Container: deployable/runtime containers and major data stores.
- Component: internal modules of a container.
- Dynamic: runtime flow sequence.
- Deployment: infrastructure mapping.

Mermaid is acceptable for portable text output. SVG/HTML generation requires actual tool availability.

## Drift report

A drift finding contains:

- area
- expected
- observed evidence
- gap
- severity
- confidence
- remediation

Examples:

- Docs mention OpenAPI, but no OpenAPI file exists.
- README says event-driven, but no broker config or event schema is present.
- Deployment manifest exposes a service not represented in architecture docs.

## Package split recommendation

Only recommend a package split when evidence shows:

- Independent capability boundaries.
- Excessive coupling or mixed responsibilities.
- Distinct deployment/runtime concerns.
- Tests or dependency graphs support separation.

## Coding-agent dev brief

A dev brief should include:

- Goal.
- Target files.
- Implementation tasks.
- Tests.
- Validation commands.
- Non-goals.
- Rollback/safety notes.
