#!/usr/bin/env node
import { createLogger } from "@mcp-toolkit/core";

const logger = createLogger({ server: "linear" });

logger.info("linear mcp server scaffolded, phase 2 not yet implemented");

// Phase 2 will add:
//   - MCP server stdio transport
//   - Tool registry: issue.list, issue.create, project.query, team.query
//   - LINEAR_API_KEY auth
//   - Audit writer wired to SqliteAuditWriter
//   - Linear GraphQL client with complexity-budget tracking
