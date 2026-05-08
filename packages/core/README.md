# atif-mcp-core

Shared building blocks for the MCP Toolkit servers.

- `runMcpServer({ name, version, tools, client })` boots an MCP stdio server with audit, error mapping, and signal handling
- `SqliteAuditWriter` and `PgAuditWriter` for the audit log, behind a single `AuditWriter` interface
- `requireEnv` / `optionalEnv` for env-driven config
- `createLogger` writes JSON to stderr (never stdout, that would corrupt the MCP protocol)
- `McpToolError` hierarchy: `AuthError`, `NotFoundError`, `RateLimitError`
- `handleCli` adds `--init`, `--help`, `--version` to a server bin in two lines

Also ships the `atif-mcp-replay` CLI for printing recent tool calls from the audit log.

```sh
npx atif-mcp-replay --server github --limit 10
npx atif-mcp-replay --server linear --tool team.query --args
```

## Source

[github.com/atifali-pm/mcp-toolkit](https://github.com/atifali-pm/mcp-toolkit)
