# Example: Agent-ready API Wrapper

## Input

“Wrap this large API so an agent can safely use it.”

## Expected checks

- Narrow the operation set to the smallest useful tool surface.
- Require explicit schemas for inputs and outputs.
- Separate read-only from write tools.
- Require auth boundary and permission model.
- Add confirmation gates for destructive or irreversible writes.
- Redact secrets and sensitive payloads.
- Add observability and audit logging requirements.

## Output pattern

```markdown
## Middleware/API Architecture Brief
### Context boundary
Agent-facing wrapper over existing API. Exact upstream endpoints are SOURCE_NEEDED.

### Contracts
MISSING: upstream OpenAPI or equivalent contract.

### Security
Require least-privilege auth and per-tool authorization. Writes require user approval.
```
