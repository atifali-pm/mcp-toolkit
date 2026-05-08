# atif-mcp-github

GitHub MCP server. Issue CRUD, PR review, repo search, all over stdio for Claude Desktop / Cursor / any MCP client.

Surfaces remaining rate-limit quota in error meta and audits every call to a local SQLite log.

## Tools

- `issue.list` list issues with state + label filters
- `issue.create` create a new issue with title, body, labels
- `issue.update` patch any subset of title, body, state, labels
- `pr.review` submit APPROVE / REQUEST_CHANGES / COMMENT review on a PR
- `repo.search` search public repos with the same query syntax as github.com/search

## Quick start

```sh
npx atif-mcp-github --init
```

Paste the printed block into `claude_desktop_config.json` (or `~/.cursor/mcp.json`), set `GITHUB_TOKEN`, restart the client.

## Source

[github.com/atifali-pm/mcp-toolkit](https://github.com/atifali-pm/mcp-toolkit)
