# Example: Repo Architecture Audit

## Input

“Here is a repository ZIP. Build architecture.json and show drift.”

## Expected steps

1. Inventory source tree and manifests.
2. Identify contracts, entrypoints, tests, deployment files, and docs.
3. Generate architecture.json from evidence only.
4. Produce drift findings.
5. Produce coding-agent handoff for remediation.

## Expected drift row

| Area | Expected | Evidence | Gap | Severity | Confidence | Remediation |
|---|---|---|---|---|---:|---|
| API contract | OpenAPI present for public API | No OpenAPI file found in repo inventory | Contract missing | high | 4 | Add or locate contract before client generation |
