# Source Policy

## Purpose

Define the source hierarchy and claim-labeling rules for the middleware-project-orchestrator-harness.

## Source hierarchy

Use sources in this order:

1. **Provided artifacts**: uploaded Skill ZIPs, Markdown files, source references, user-provided contracts, and chat context.
2. **Primary standards and official specifications**: OpenAPI, AsyncAPI, JSON Schema, GraphQL Specification, gRPC/Protocol Buffers, CloudEvents, OAuth/OIDC/JWT/DPoP RFCs, OWASP API Security, OpenTelemetry.
3. **Official vendor or project documentation**: OpenAI Skills/API/Codex docs, Claude Code docs, MCP docs, gateway/cloud/vendor documentation.
4. **Repository evidence**: source code, tests, CI config, manifests, deployment files, contracts, diagrams.
5. **Runtime evidence**: logs, traces, metrics, HAR/cURL captures, gateway exports, error payloads.
6. **Secondary sources**: articles, blog posts, generated summaries, informal notes. Use only for orientation and never as sole authority for material claims.

## Claim labels

- `FACT`: directly supported by a source or artifact.
- `INFERENCE`: logically derived from one or more facts.
- `ASSUMPTION`: necessary to proceed but not verified.
- `SOURCE_NEEDED`: plausible but requires external verification.
- `MISSING`: required information is absent.

## Freshness rules

Use current official sources for:

- Platform capabilities: OpenAI Skills, Codex, Claude Code, MCP, hosted tools, Actions, subagents, hooks, plugins.
- Standards versions and normative security rules.
- Cloud, gateway, broker, SDK, or library behavior.
- Rate limits, pricing, product availability, hosted-runtime behavior, and security recommendations.

## Evidence precedence

- Runtime evidence can override stale documentation, but the contradiction must be recorded.
- Repository evidence can override architecture diagrams if implementation differs, but both must be preserved.
- User claims are input evidence, not automatically facts about external systems.
- Generated summaries are not primary evidence unless they quote or cite primary material.

## Output rule

Every architecture, tool, platform, or security statement that affects design or execution must carry one of the claim labels when auditability is required.
