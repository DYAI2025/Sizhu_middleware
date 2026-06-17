# Example: Middleware/API Design Routing

## Input

“Design partner middleware between our CRM and ERP. REST is probably enough.”

## Expected routing

- Required: meta-decision-layer, middleware-api-thinking-core, evidence-classifier.
- Optional: project-harness-governance if the design becomes an agent workflow.
- Blocked: implementation code until contracts, auth model, object ownership, and test path exist.

## Expected output

```markdown
## Middleware/API Architecture Brief
### Context boundary
CRM is producer/consumer, ERP is producer/consumer. Exact ownership is MISSING.

### Contracts
SOURCE_NEEDED: OpenAPI or equivalent HTTP contract for CRM and ERP-facing interfaces.

### Security
MISSING: identity provider, authn/authz, tenant model, object-level authorization.

### Reliability
ASSUMPTION: Write operations require idempotency if retried.
```
