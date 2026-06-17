# Middleware Project Orchestrator Harness

Version: 0.1.0

This installable Skill package defines a meta-orchestrator for software projects, middleware/API systems, GPT or agent harnesses, repositories, architecture models, GoalForge objectives, output artifacts, validation, and recalibration.

## What it does

The Skill operates as a control plane:

`Input -> Intent Parsing -> Decision Packet -> Routing -> Evidence -> Ontology -> Architecture -> Governance -> GoalForge -> Output -> Validation -> Recalibration`

It is suited for:

- Middleware and API architecture decisions.
- Agent-ready API wrapper design.
- GPT, Codex, Claude Code, and MCP-compatible harness planning.
- Repository architecture modeling and drift analysis.
- Evidence ledgers, gap matrices, and coding-agent handoffs.
- Skill-package creation and validation.

## Package layout

```text
middleware-project-orchestrator-harness/
  SKILL.md
  README.md
  agents/openai.yaml
  references/
  examples/
  scripts/
```

## Version placement

The package version is recorded in `SKILL.md` under `metadata.version`, in this README, and in `agents/openai.yaml`. The top-level `version` field is intentionally not used in SKILL.md frontmatter because the available local validator accepts `name`, `description`, `license`, `allowed-tools`, and `metadata` only.

## Local validation

From the parent directory of the skill folder:

```bash
python middleware-project-orchestrator-harness/scripts/quick_validate.py middleware-project-orchestrator-harness
python middleware-project-orchestrator-harness/scripts/validate_reference_integrity.py middleware-project-orchestrator-harness
python middleware-project-orchestrator-harness/scripts/validate_subskill_contracts.py middleware-project-orchestrator-harness
```

Validate a Decision Packet:

```bash
python middleware-project-orchestrator-harness/scripts/validate_decision_packet.py decision_packet.yaml
```

## Packaging

Use the platform packaging script when available:

```bash
python /home/oai/skills/skill-creator/scripts/package_skill.py middleware-project-orchestrator-harness ./dist
```

The resulting archive should contain one top-level folder and exactly one `SKILL.md` entrypoint.

## Security and governance

This Skill does not require secrets. It does not assume web, GitHub, MCP, CI, container, or browser access. Optional tools are represented as optional capabilities only and must be verified at runtime.
