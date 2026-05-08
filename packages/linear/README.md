# atif-mcp-linear

Linear MCP server. Issue CRUD, project queries, team queries, all over stdio for Claude Desktop / Cursor / any MCP client.

Maps Linear's GraphQL errors and the request + complexity rate-limit headers onto a single error contract, audits every call to a local SQLite log.

## Tools

- `issue.list` filter by team key, state name, assignee email
- `issue.create` create a new issue with title, description, priority, assignee
- `project.query` list projects with progress, dates, lead
- `team.query` list teams with id (UUID for issue.create), key, issue count

## Quick start

```sh
npx atif-mcp-linear --init
```

Paste the printed block into `claude_desktop_config.json` (or `~/.cursor/mcp.json`), set `LINEAR_API_KEY`, restart the client.

## Source

[github.com/atifali-pm/mcp-toolkit](https://github.com/atifali-pm/mcp-toolkit)
