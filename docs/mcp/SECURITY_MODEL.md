# Sizhu MCP Security Model

## Default posture

The MCP layer is fail-closed. Public read-only tools may run anonymously. Any non-public tool requires an explicit MCP auth context. Dangerous external-effect tools are denied by default.

## Auth context

```ts
type McpAuthContext = {
  principalType: "anonymous" | "user" | "service_agent";
  email?: string;
  role?: "owner" | "admin" | "operator" | "viewer" | null;
  aal?: "aal1" | "aal2" | string;
  scopes: string[];
};
```

For stdio use, the current implementation derives the context from environment variables:

```env
MCP_AGENT_PRINCIPAL_TYPE=service_agent
MCP_AGENT_ROLE=operator
MCP_AGENT_AAL=service
MCP_AGENT_SCOPES=sizhu:readiness
```

## Tool sensitivity levels

| Sensitivity | Access rule |
|---|---|
| `public_read` | Allowed for everyone |
| `session_read` | Requires `user` or `service_agent` unless auth is explicitly disabled |
| `sensitive_admin` | Requires role `owner`, `admin`, or `operator`; user principals require `aal2` when MFA is enabled |
| `dangerous_external_effect` | Denied by default unless explicitly enabled by policy and feature flag |

## Feature flags

```env
MCP_ENABLED=true
MCP_REQUIRE_AUTH=true
MCP_ALLOW_DANGEROUS_TOOLS=false
MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true
```

## Secret handling

MCP responses pass through a response sanitizer. Known secret-like environment variable values are redacted from nested objects and arrays. If an unsanitized known secret is detected, the tool response fails closed instead of returning the value.

Secret-like environment variable names include patterns such as:

- `SECRET`
- `TOKEN`
- `API_KEY`
- `SERVICE_ROLE`
- `JWT`
- `PASSWORD`
- `PRIVATE_KEY`

## Logging rules

- Never log JWTs, API keys, service role keys, or private keys.
- Log tool name, sensitivity, outcome, and error code only.
- Do not log raw tool arguments if they may contain PII.

## POD/Gelato boundary

POD dispatch is not enabled as an MCP tool in this build. A future implementation must add a real provider contract, product mapping, idempotency proof, human approval gate, and real-boundary smoke test before exposing any dispatch-capable tool.
