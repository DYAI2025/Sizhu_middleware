# Sizhu MCP Agent Usage

## Install

```bash
npm ci
```

## Run tests

```bash
npm run test:mcp
npm run lint
npm run build
```

## Start MCP over stdio

For public health only:

```bash
MCP_ENABLED=true npm run mcp:stdio
```

For readiness access as a local service agent:

```bash
MCP_ENABLED=true \
MCP_REQUIRE_AUTH=true \
MCP_AGENT_PRINCIPAL_TYPE=service_agent \
MCP_AGENT_ROLE=operator \
MCP_AGENT_AAL=service \
MCP_AGENT_SCOPES=sizhu:readiness \
npm run mcp:stdio
```

## Client configuration

Use your MCP client's stdio command configuration. Generic shape:

```json
{
  "mcpServers": {
    "sizhu": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "env": {
        "MCP_ENABLED": "true",
        "MCP_REQUIRE_AUTH": "true",
        "MCP_AGENT_PRINCIPAL_TYPE": "service_agent",
        "MCP_AGENT_ROLE": "operator",
        "MCP_AGENT_AAL": "service",
        "MCP_AGENT_SCOPES": "sizhu:readiness"
      }
    }
  }
}
```

Client-specific file locations and schema details vary. Verify them against your target MCP client before rollout.

## First calls

1. List tools.
2. Call `sizhu.health_check` with `{}`.
3. Call `sizhu.readiness_check` with `{}` after configuring the service-agent context.
4. Call `sizhu.fufire_test_run` only with an admin/operator policy context and safe test input.

## Current limitations

- No HTTP/SSE/Streamable HTTP transport in this build.
- FuFire MCP test-run exists, but requires admin/operator policy context and real FuFire environment for live upstream calls.
- No workflow run MCP tool yet.
- No POD dispatch MCP tool.
- Readiness is local environment readiness, not a production live-smoke proof.

## Troubleshooting

### `MCP_AUTH_REQUIRED`

Set `MCP_AGENT_PRINCIPAL_TYPE=service_agent` or `user` and provide an allowed role where needed.

### `NOT_READY`

Set required runtime values:

```env
SECRET_REF_FUFIRE_API_KEY=...
SECRET_REF_SUPABASE_SERVICE_ROLE=...
FUFIRE_BASE_URL=https://api.fufire.space
SUPABASE_URL=https://your-project.supabase.co
```

### Unsupported transport

This build supports stdio only. Use `npm run mcp:stdio`.
