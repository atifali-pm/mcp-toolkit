#!/usr/bin/env node
import { createLogger } from "@mcp-toolkit/core";

const logger = createLogger({ server: "gmail" });

logger.info("gmail mcp server scaffolded, phase 3 not yet implemented");

// Phase 3 will add:
//   - MCP server stdio transport
//   - OAuth2 flow with token refresh, persisted credential cache
//   - Tool registry: message.list, message.read, message.send, label.apply
//   - Audit writer wired to SqliteAuditWriter
//   - Buyer-side Google Cloud setup guide as a deliverable
