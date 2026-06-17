# Source Map

## Provided source families

| Source | Type | Purpose | Reliability | Limits | Skill Use | Refresh Policy |
|---|---|---|---|---|---|---|
| claude-cowork-project-orchestrator.zip | Provided Skill ZIP | Vague intent to project objective, PAD/PRD-lite, plan, Claude prompt contract | High for provided skill behavior | Not official Claude docs | Compatibility synthesis | Refresh when source skill changes |
| middleware-api-architect.zip | Provided Skill ZIP | Contract-first middleware/API reasoning, gates, output templates, ontology | High for local design method | Not proof of current standards versions | Core architecture module | Refresh when source skill changes |
| project-super-gpt-harness.zip | Provided Skill ZIP | GPT project harness governance, evidence ledger, quality gates | High for local design method | Not proof of tool availability | Harness governance module | Refresh when source skill changes |
| repo-architecture-visualization-harness.zip | Provided Skill ZIP | Repo inventory, architecture.json, visualization, drift reports | High for local design method | Visualization style is project-specific | Repo architecture module | Refresh when source skill changes |
| goal-forge.zip | Provided Skill ZIP | Compact objective contract and acceptance criteria | High for local objective format | Not a substitute for architecture evidence | Objective compiler | Refresh when source skill changes |
| wichtig_einige_begriffe_aus_deinem_modell_sind_al.md | Provided Markdown | Meta decision control plane, Decision Packet, anti-false-certainty warnings | High for user intent and local constraints | Contains references requiring external verification | Core control-plane source | Refresh when user updates |
| skill-building-orchestrator.md and skill-trainer materials | Provided Markdown | Skill packaging pattern, filetree/full-files output, validation conventions | High for project workflow | Not official platform spec | Skill package composition | Refresh when user updates |

## Official source families

| Source | Type | Purpose | Reliability | Limits | Skill Use | Refresh Policy |
|---|---|---|---|---|---|---|
| OpenAI API Skills docs | Official vendor docs | OpenAI Skill bundle, SKILL.md, zip upload, validation, safety | High | Product behavior may change | OpenAI compatibility | Check when packaging or invoking Skills |
| OpenAI Codex AGENTS.md docs | Official vendor docs | Codex project instruction discovery and precedence | High | Product behavior may change | Codex compatibility | Check before Codex-specific claims |
| OpenAI Codex Skills docs | Official vendor docs | Codex Skill progressive disclosure and plugin relation | High | Product behavior may change | Codex compatibility | Check before Codex-specific claims |
| Claude Code Skills docs | Official vendor docs | Claude Code SKILL.md, supporting files, invocation, tool fields | High | Product behavior may change | Claude compatibility | Check before Claude-specific claims |
| Claude Code Subagents and Hooks docs | Official vendor docs | Subagent isolation, tool scoping, hooks lifecycle | High | Product behavior may change | Claude compatibility | Check before subagent/hook claims |
| MCP Specification | Official protocol spec | MCP hosts, clients, servers, resources, prompts, tools, consent | High | Protocol version can change | Optional MCP boundary | Check latest version before MCP designs |
| OpenAPI Specification | Primary standard | HTTP API description and contract-first design | High | Version-sensitive | REST/HTTP contracts | Check latest published spec |
| AsyncAPI Specification | Primary standard | Message-driven API contracts | High | Version-sensitive | Event/message contracts | Check latest published spec |
| JSON Schema Specification | Primary standard | Validation vocabulary and meta-schemas | High | Draft-sensitive | Schema validation | Check dialect/version |
| GraphQL Specification | Primary standard | GraphQL schema and execution semantics | High | Version-sensitive | GraphQL contract reasoning | Check latest release |
| gRPC and Protocol Buffers docs | Official project docs | RPC service definition and typed payload schemas | High | Implementation varies by language | gRPC contract reasoning | Check language-specific docs if coding |
| CloudEvents | CNCF specification | Common event envelope | High | Bindings vary | Event envelope decisions | Check latest specification |
| OWASP API Security Top 10 2023 | Security reference | API authz/authn/resource/inventory security gates | High | Not a complete threat model | Security gate checklist | Check for newer edition |
| OpenTelemetry docs | Official project docs | Observability signals, instrumentation, collector | High | SDK details vary | Observability gate | Check SDK/version-specific docs |
| C4 Model | Official model site | Architecture visualization abstraction | High | Not a formal standard | Visual model guidance | Check when using C4 terminology |
| arc42 docs | Official docs | Architecture documentation structure | High | Template, not runtime proof | Documentation structure | Check when using arc42 sections |
| RFC 9449 DPoP and related RFCs | IETF standard | Sender-constrained OAuth token option | High | Context-dependent security option | Security option review | Check when DPoP is relevant |

## Claim handling rule

Do not encode a source in the Evidence Ledger unless the exact claim has been checked against it or provided by the user artifacts. Use `SOURCE_NEEDED` otherwise.
