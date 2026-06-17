# Example: Skill Routing Decision

## Input

“Create a Skill that audits middleware repos and produces a prompt for Codex.”

## Expected routing

```yaml
routing:
  required_modules:
    - research-backed-skill-builder
    - middleware-api-thinking-core
    - repo-architecture-visualization-model
    - platform-compatibility
  optional_modules:
    - goalforge-objective-contract
    - project-harness-governance
  blocked_modules:
    - github
  rationale:
    - github unavailable unless runtime provides connector and authorization
```
