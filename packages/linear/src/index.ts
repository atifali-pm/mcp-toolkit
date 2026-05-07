#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  type AuditWriter,
  McpToolError,
  SqliteAuditWriter,
  createLogger,
  noopAuditWriter,
  optionalEnv,
  requireEnv,
} from "@mcp-toolkit/core";
import { LinearClient } from "./linear-client.js";
import { TOOLS } from "./tools.js";

const SERVER_NAME = "linear";
const SERVER_VERSION = "0.0.1";

const logger = createLogger({ server: SERVER_NAME });

const apiKey = requireEnv(
  "LINEAR_API_KEY",
  "Create a personal API key at https://linear.app/settings/account/security.",
);
const client = new LinearClient({ apiKey });

const audit = openAudit();

const server = new Server(
  { name: `atif-mcp-${SERVER_NAME}`, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  const tool = TOOLS.find((t) => t.name === name);
  const startedAt = Date.now();

  if (!tool) {
    const message = `Unknown tool: ${name}`;
    audit.write({
      server: SERVER_NAME,
      tool: name,
      args,
      response: null,
      durationMs: Date.now() - startedAt,
      status: "error",
      errorCode: "unknown_tool",
      errorMessage: message,
    });
    return errorResult(message);
  }

  try {
    const result = await tool.handler(client, args);
    const durationMs = Date.now() - startedAt;
    audit.write({
      server: SERVER_NAME,
      tool: name,
      args,
      response: result.data,
      durationMs,
      status: "ok",
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { data: result.data, rate_limit: result.rateLimit },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const { message, code, meta } = unwrapError(err);
    audit.write({
      server: SERVER_NAME,
      tool: name,
      args,
      response: null,
      durationMs,
      status: "error",
      errorCode: code,
      errorMessage: message,
    });
    logger.warn("tool call failed", { tool: name, code, message });
    return errorResult(message, meta);
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("linear mcp server connected", { tools: TOOLS.map((t) => t.name) });
}

function openAudit(): AuditWriter {
  const override = optionalEnv("MCP_TOOLKIT_AUDIT_DB");
  if (override === "off") return noopAuditWriter;
  const path = override ?? defaultAuditPath();
  try {
    return new SqliteAuditWriter(path);
  } catch (err) {
    logger.warn("audit writer disabled", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    return noopAuditWriter;
  }
}

function defaultAuditPath(): string {
  const dir = join(homedir(), ".mcp-toolkit");
  mkdirSync(dir, { recursive: true });
  return join(dir, "audit.db");
}

function unwrapError(err: unknown): { message: string; code: string; meta?: Record<string, unknown> } {
  if (err instanceof McpToolError) {
    const out: { message: string; code: string; meta?: Record<string, unknown> } = {
      message: err.message,
      code: err.code,
    };
    if (err.meta !== undefined) out.meta = err.meta;
    return out;
  }
  if (err instanceof Error) return { message: err.message, code: "internal" };
  return { message: String(err), code: "internal" };
}

function errorResult(message: string, meta?: Record<string, unknown>) {
  const payload: Record<string, unknown> = { error: message };
  if (meta !== undefined) payload.meta = meta;
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

const shutdown = (): void => {
  audit.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  logger.error("linear mcp server failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
