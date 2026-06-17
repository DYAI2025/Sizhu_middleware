# GoalForge Objective Contract

## Purpose

Compress a project or implementation intent into one bounded, testable objective for a coding agent or implementation workflow.

## Rules

1. Produce one objective only.
2. Use explicit scope and non-goals.
3. Include hard constraints.
4. Include pass/fail acceptance criteria.
5. Include definition of done.
6. Include out-of-scope boundaries.
7. Include reference docs and evidence dependencies.
8. Do not invent architecture, APIs, tools, repository paths, or runtime facts.

## Template

```markdown
# GoalForge Objective

## Goal
One concise objective.

## Scope
- Included area.
- Included artifacts.

## Non-goals
- Explicitly excluded work.

## Hard constraints
- Constraint that must not be violated.

## Acceptance criteria
- [ ] Pass/fail criterion with observable evidence.
- [ ] Pass/fail criterion with validation command or review method.

## Definition of done
- Deliverable exists.
- Validation passes.
- Evidence ledger updated.
- Remaining MISSING/SOURCE_NEEDED items listed.

## Out of scope
- Work not authorized in this objective.

## Reference docs
- Source or reference name.
```

## Discovery objective fallback

If the project lacks sufficient evidence, produce a discovery objective:

```markdown
# GoalForge Objective

## Goal
Create a Decision Packet and Evidence Ledger for the project before implementation.

## Scope
- Normalize intent.
- Inventory artifacts.
- Identify missing contracts, security facts, runtime facts, and validation paths.

## Non-goals
- No production implementation.
- No destructive actions.

## Acceptance criteria
- [ ] Decision Packet includes task class, routing, governance, and output contract.
- [ ] Evidence Ledger labels all material claims.
- [ ] Missing facts are listed with blockers.
```

## Anti-patterns

- Multiple unrelated goals.
- Vague criteria such as “works well”.
- Hidden assumptions.
- Tool-specific actions without tool availability.
- Security or test omissions.
