# MCP Toolkit, hands-on build guide

This file is the kickoff brief for the next Claude Code session in this repo. Read it top to bottom before writing code.

## Screenshots

When you hit a UI milestone (server connected in Claude Desktop, tool call succeeded, audit log populated, etc.), capture a screenshot and save it to `/screenshots/` at the repo root. Use descriptive filenames like `01-github-mcp-claude.png`, `02-linear-mcp-issue.png`, `03-gmail-mcp-search.png`, `04-audit-log.png`.

**Embed every screenshot in README.md** via relative markdown image refs: `![GitHub MCP in Claude Desktop](screenshots/01-github-mcp-claude.png)`. A public repo with screenshots embedded in the README is a complete portfolio artifact. **A live deploy URL is optional, not required.** Most viewers who land on the GitHub page see the app in action through the README; that IS the demo.

`/screenshots/` is the one canonical location for source image files. Do not duplicate them into `/docs/` or `/public/`. The README and the portfolio site both reference them from `/screenshots/` (the portfolio-maintainer copies them to the site's public dir at promotion time).

The portfolio-maintainer at `~/projects/portfolio/.claude/agents/portfolio-maintainer.md` looks in `/screenshots/` when deciding whether to promote the project to atifali.pages.dev. No screenshots = the project does not qualify.

## Preflight

- Node 20+ installed (`node -v`)
- pnpm installed (`pnpm -v`, install via `npm i -g pnpm` if missing)
- Claude Desktop installed locally for live testing of MCP servers
- A GitHub personal access token (for Phase 1 testing)
- A Linear API key (for Phase 2 testing)
- A Google Cloud project with Gmail API enabled and an OAuth client (for Phase 3, see Phase 3 notes)
- No port binding, MCP runs over stdio inside the client process

## Kickoff prompt for the next Claude session

```
Read HANDS-ON.md end to end. Then read the per-project memory at
~/.claude/projects/-home-atif-projects-mcp-toolkit/memory/ starting with
project_mcp_toolkit.md and MEMORY.md.

We're starting Phase 0. Set up a pnpm workspace monorepo with:
  - packages/core (shared auth, audit, logging)
  - packages/github (first MCP server)
  - packages/linear (placeholder)
  - packages/gmail (placeholder)

Pin @modelcontextprotocol/sdk to a known-good version. Use TypeScript
strict mode. Configure tsconfig with project references so each package
builds independently.

Stop after Phase 0 boots cleanly. We add Phase 1 in the next session.
```

## Phase plan

- [ ] Phase 0: Monorepo scaffold
  - [ ] pnpm-workspace.yaml at repo root
  - [ ] packages/core, packages/github, packages/linear, packages/gmail
  - [ ] Root tsconfig with project references, strict mode on
  - [ ] Lint config (eslint or biome) wired up
  - [ ] First commit per package builds with `pnpm -r build`
- [ ] Phase 1: GitHub MCP server
  - [ ] Tool list: issue.list, issue.create, issue.update, pr.review, repo.search
  - [ ] PAT auth via env (`GITHUB_TOKEN`)
  - [ ] Rate-limit handling, surface remaining quota in errors
  - [ ] Audit every call to SQLite via packages/core
  - [ ] Verified end-to-end in Claude Desktop, screenshot saved
- [ ] Phase 2: Linear MCP server
  - [ ] Tool list: issue.list, issue.create, project.query, team.query
  - [ ] API key auth via env (`LINEAR_API_KEY`)
  - [ ] Audit logging
  - [ ] Verified in Claude Desktop, screenshot saved
- [ ] Phase 3: Gmail MCP server
  - [ ] Tool list: message.list, message.read, message.send, label.apply
  - [ ] OAuth flow with token refresh, document buyer-side Google Cloud setup
  - [ ] Audit logging
  - [ ] Verified in Claude Desktop, screenshot saved
- [ ] Phase 4: Audit module hardening
  - [ ] SQLite default schema (id, server, tool, args_json, response_json, ts)
  - [ ] Postgres adapter behind same interface, switched via env
  - [ ] Replay command: print last N calls per server
- [ ] Phase 5: README polish + demo recordings
  - [ ] Each server gets a 30-second screen recording embedded as a screenshot strip
  - [ ] Buyer-facing setup steps for each server
- [ ] Phase 6: Optional CLI installer
  - [ ] `npx atif-mcp-github` writes the right block into claude_desktop_config.json
  - [ ] Per-package npm publish under `atif-` scope

## Known gotchas

- The MCP spec is still evolving. Pin `@modelcontextprotocol/sdk` to an exact version and bump deliberately, not via `^`. Breaking changes have shipped between minor versions.
- Gmail OAuth needs a Google Cloud project with the Gmail API enabled, an OAuth consent screen, and a Desktop client. Document every click for the buyer. The setup guide is a deliverable.
- Rate limits to surface in error messages: GitHub 5000 req/hr per token, Linear varies by plan and complexity points, Gmail 250 quota units per second per user. Wrap responses so the AI client sees the remaining budget.
- Tool descriptions are read by the LLM. Avoid jargon. Describe what the tool actually does, not how it's implemented. "Create a GitHub issue with title and body, return the issue URL" beats "POST /repos/{owner}/{repo}/issues".
- stdio transport means console.log will corrupt the protocol. All logging goes through the structured logger in packages/core, never raw console.
- Audit log writes must not block tool responses. Fire-and-forget the write or batch them.
- Tokens never leave the local machine. Document this clearly in the README so buyers trust the install.

## Buyer-facing artifacts to produce

- Per-server `claude_desktop_config.json` snippet
- Per-server troubleshooting block: token scopes, common errors, how to reset audit DB
- One Loom or short MP4 per server showing it answer a real question end-to-end
