# Project Harness Governance

## Purpose

Model GPT/agent project work as a governed system rather than a pile of instructions and files.

## Core components

### Knowledge Manifest

Records:

- File name or source.
- Source type.
- Purpose.
- Authority level.
- Refresh policy.
- Known limits.
- Claims derived from the source.

### Evidence Ledger

Records:

- Claim.
- Label: FACT, INFERENCE, ASSUMPTION, SOURCE_NEEDED, MISSING.
- Source.
- Confidence.
- Verification need.

### Decision Log

Records:

- Decision.
- Rationale.
- Alternatives considered.
- Evidence used.
- Risk and rollback path.
- Date or version context when available.

### Prompt/Skill Registry

Records:

- Skill, prompt, agent, or subagent name.
- Trigger conditions.
- Input contract.
- Output contract.
- Tool requirements.
- Safety limitations.

### Action/Tool Boundary

Distinguish:

- Project instructions: persistent guidance.
- Skills: reusable workflow bundles.
- Tools: callable runtime actions.
- MCP servers: optional external tool/resource/prompt surfaces.
- Actions/connectors: platform-specific integrations.
- CI/GitHub/browser/container: environment-specific tools.
- Human approval: required for destructive or high-impact operations.

## MCP boundary

MCP is optional. Treat MCP as a standardized integration surface that may expose resources, prompts, and tools. Do not assume an MCP server exists. Do not assume server-provided tool descriptions are trusted without review.

## External truth layer

For current facts, use official docs or runtime evidence. The harness should not rely on static memory for:

- Platform feature availability.
- API versions.
- Security requirements.
- SDK behavior.
- Cloud and gateway behavior.
- Pricing, quotas, or rate limits.

## Evaluation scenarios

Every serious harness should include:

- Normal-use scenario.
- Ambiguous-intent scenario.
- Missing-evidence scenario.
- Prompt-injection or malicious document scenario where relevant.
- Tool-unavailable scenario.
- Security-blocker scenario.
- Recalibration scenario after a contradiction is discovered.

## Quality gates

- No phantom tools.
- No unreviewed secrets.
- No destructive action without explicit authorization.
- Evidence labels present for material claims.
- Evaluation plan present.
- Knowledge and action surfaces separated.
- Unsupported claims downgraded or marked `SOURCE_NEEDED`.
