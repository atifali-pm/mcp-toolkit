#!/usr/bin/env node
import { createLogger } from "@mcp-toolkit/core";

const logger = createLogger({ server: "github" });

logger.info("github mcp server scaffolded, phase 1 not yet implemented");

// Phase 1 will add:
//   - MCP server stdio transport via @modelcontextprotocol/sdk
//   - Tool registry: issue.list, issue.create, issue.update, pr.review, repo.search
//   - GITHUB_TOKEN auth via @mcp-toolkit/core/auth
//   - Audit writer wired to SqliteAuditWriter
//   - Rate-limit error surface using RateLimitError from core
