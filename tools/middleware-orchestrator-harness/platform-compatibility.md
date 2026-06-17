# Platform Compatibility

## ChatGPT / OpenAI Skill

OpenAI Skills are versioned bundles of files with a `SKILL.md` manifest. Use this package as a single top-level folder or zip archive containing exactly one `SKILL.md` entrypoint.

Compatible components:

- `SKILL.md`: trigger metadata and core instructions.
- `references/`: progressive disclosure for detailed methods.
- `examples/`: evaluation and usage scenarios.
- `scripts/`: local validators.
- `agents/openai.yaml`: metadata for compatible environments.

OpenAI optional tools such as web, file search, container, GitHub, MCP, or CI must be treated as runtime-provided capabilities, not assumed defaults.

## Codex

Codex compatibility can be achieved by mapping this Skill into:

- `AGENTS.md`: repository or global persistent project instructions.
- Codex Skills: reusable workflows loaded by name/description and then full SKILL.md when selected.
- Optional MCP configuration: only if configured in Codex.
- Optional subagents: for repo exploration, security review, contract audit, and test planning.

Suggested Codex mapping:

```text
AGENTS.md
  - evidence labels
  - no phantom tools
  - validation commands
  - safety gates
.codex or plugin skill directory
  - middleware-project-orchestrator-harness/SKILL.md
```

## Claude / Claude Code

Claude Code compatibility can be achieved by mapping this Skill into:

- `CLAUDE.md`: project-level standing guidance.
- `.claude/skills/middleware-project-orchestrator-harness/SKILL.md`: reusable skill workflow.
- `.claude/agents/`: optional subagents such as evidence-reviewer, contract-auditor, repo-architect, security-reviewer.
- Hooks: optional lifecycle validation or pre/post tool checks, where supported.
- MCP: optional server/tool boundary, not assumed.

## Distinctions

| Concept | Meaning | Common failure |
|---|---|---|
| Skill | Reusable workflow/instructions plus supporting files | Treating ZIP in knowledge as auto-invoked Skill |
| Subagent | Specialized worker with separate context and tool scope | Delegating without clear task/output contract |
| Hook | Lifecycle automation at tool/session events | Treating hooks as reasoning substitute |
| MCP Tool | Runtime callable function exposed by an MCP server | Trusting tool descriptions without review |
| Project Instructions | Persistent project guidance | Mixing static knowledge with executable actions |
| Knowledge file | Source material for reading | Treating it as a tool or current fact source |

## Compatibility rule

When translating between platforms, preserve:

- Evidence labels.
- Decision Packet schema.
- Governance gates.
- Output contracts.
- Validation scripts or equivalent checks.
- No-phantom-tool rule.

Do not preserve platform-specific claims unless refreshed against current official documentation.
