# Meta Decision Layer

## Purpose

The Meta Decision Layer is the control plane. It decides how to classify the request, what evidence exists, which capability modules are relevant, which safety gates apply, which artifact should be produced, and how the project state should be recalibrated.

## Non-negotiable separation

- **State**: project knowledge, ontology, evidence ledger, decisions, goals, risks, handoffs.
- **Policy**: source hierarchy, claim labels, architecture gates, security rules, permission rules, validation rules.
- **Action**: skill invocation, tool call, code generation, file mutation, external API call, handoff production.

Never collapse these layers. A common failure mode is producing an architecture because it sounds plausible, while state is incomplete and policy has not allowed action.

## Pipeline

1. Intake and Intent Parsing
2. Decision Packet Builder
3. Skill / Tool / Agent Router
4. Evidence Classifier
5. Ontology and State Updater
6. Architecture Reasoning Engine
7. Governance and Safety Gate
8. GoalForge Objective Compiler
9. Output Artifact Composer
10. Validation Runner
11. Recalibration Loop

## Task classes

| Class | Meaning | Default artifact |
|---|---|---|
| `qa` | Explanation, comparison, conceptual answer | Decision Summary or concise answer |
| `operations` | Concrete action or tool/repo/API execution | Governance decision then action plan |
| `investigation` | Evidence review, root cause, analysis | Evidence Ledger plus Gap Matrix |
| `development` | Build or modify something | GoalForge Objective plus handoff |
| `audit` | Review against requirements, security, contracts | Gap Matrix plus remediation backlog |
| `skill_build` | Produce or update a Skill package | Skill package plus validation report |
| `architecture` | System design or architecture decision | Architecture Brief |
| `repo_analysis` | Repository inventory, architecture model, drift | Repo Architecture Model |
| `middleware_design` | Middleware/API/integration design | Middleware/API Architecture Brief |
| `harness_design` | GPT/Claude/Codex/MCP harness | Project Harness Brief |

## Routing score

Use this scoring model qualitatively or numerically:

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

## Blocker rules

Block implementation or mark the output as provisional when:

- Contract evidence is missing for a public or cross-team API.
- Authn/authz is unknown for a protected API.
- Object or function-level authorization is not addressed where IDs or business actions exist.
- A write operation has retries but no idempotency model.
- An event flow lacks schema, ordering, dedupe, replay, and DLQ decisions.
- Observability or test path is absent for production-bound architecture.
- Tool, MCP, CI, GitHub, browser, or shell availability is not proven.
- The request requires destructive action without explicit authorization.
- A formalism is being treated as a correctness guarantee rather than a validation aid.

## Output rule

For broad or ambiguous requests, output:

1. Decision Summary
2. Activated or recommended modules
3. Evidence state
4. Governance blockers
5. Smallest next artifact
6. Recalibration notes
