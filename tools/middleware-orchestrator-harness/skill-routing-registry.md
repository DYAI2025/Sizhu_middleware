# Skill Routing Registry

## Purpose

Map task signals to capability modules and output contracts. The registry is advisory and must be reconciled with actual runtime availability.

## Routing formula

```text
score = capability_match
      + evidence_fit
      + risk_reduction
      + context_savings
      + output_contract_fit
      - permission_cost
      - hallucination_risk
      - incompatibility_penalty
```

Use `high`, `medium`, `low`, or a 0 to 5 score for each term.

## Module registry

| Module | Capability tags | Trigger signals | Primary outputs | Blockers |
|---|---|---|---|---|
| meta-decision-layer | intent, decision packet, routing, governance | control plane, unclear request, multi-skill task | Decision Summary, Decision Packet | none |
| evidence-classifier | source policy, labels, confidence | facts, assumptions, verify, audit | Evidence Ledger | missing source access |
| middleware-api-thinking-core | API, middleware, contracts, security, observability | REST, OpenAPI, AsyncAPI, GraphQL, gRPC, webhook, event | Architecture Brief, Gap Matrix | no contract or requirements |
| project-harness-governance | GPT, Skills, Actions, MCP, Codex, Claude | harness, custom GPT, project, agent workspace | Project Harness Brief | phantom tool risk |
| repo-architecture-visualization-model | repo, architecture.json, C4, Mermaid, drift | repository, ZIP, codebase, diagram | Repo Architecture Model | no repo evidence |
| goalforge-objective-contract | goal, objective, coding agent | /goal, implementation target, acceptance criteria | GoalForge Objective | broad unbounded scope |
| output-contracts | format, templates | report, handoff, gap matrix | declared artifact | no selected artifact |
| validation-rules | validation, package, schema | validate, installable, CI, quality gate | Validation Report | missing files |
| recalibration-loop | state update, contradiction, next step | update model, what changed, drift | Recalibration Notes | no prior state |

## Tool routing

| Tool | Use only when | Evidence requirement | Permission rule |
|---|---|---|---|
| web | Current official source required | URL and retrieved text | Allowed for research unless user forbids |
| file_search | Uploaded file evidence needed | Uploaded file result | Read-only |
| container | Local file/package/script validation needed | Mounted paths | No destructive external action |
| github | Repository API actions needed | Authenticated connector/tool availability | User authorization for writes |
| mcp | External tool/resource through MCP needed | Configured server and tool schema | Consent and tool safety review |
| ci | Build/test pipeline needed | CI configuration or tool availability | User authorization for high-impact runs |

## Routing examples

### Vague project idea
Required: meta-decision-layer, project-harness-governance, goalforge-objective-contract.
Optional: ultimate prompt architecture, middleware core if API terms appear.

### Partner API middleware
Required: meta-decision-layer, middleware-api-thinking-core, evidence-classifier, validation-rules.
Optional: repo visualization if code is supplied.

### Repository ZIP audit
Required: repo-architecture-visualization-model, evidence-classifier, validation-rules.
Optional: middleware core if contracts or integrations exist.

### Skill package build
Required: research-backed skill building behavior, source-policy, output-contracts, validation-rules.
Optional: platform compatibility.

## Fallback behavior

If no module reaches a safe score, output a Decision Summary with `MISSING` and `SOURCE_NEEDED` rather than inventing an artifact.
