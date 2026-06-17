# Example: Recalibration Loop

## Input

A prior architecture assumed async events, but repo evidence shows synchronous REST calls.

## Expected output

```markdown
## Recalibration Notes
- New facts: Repository contains HTTP client calls for order submission.
- Contradictions: Prior event-driven assumption conflicts with observed REST implementation.
- Downgraded claims: “Order flow is event-driven” changed from ASSUMPTION to contradicted.
- Next safe artifact: Gap Matrix comparing intended event flow with implemented REST flow.
```

## Rule

Never overwrite the old assumption silently. Record the contradiction and next validation step.
```
