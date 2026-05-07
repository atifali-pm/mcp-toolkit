import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { type AuditWriter } from "./audit.js";
import { selectAuditWriter } from "./audit-factory.js";
import { McpToolError } from "./errors.js";
import { type Logger, createLogger } from "./logger.js";
import type { ToolDefinition } from "./tools.js";

export interface RunMcpServerOptions<TClient> {
  name: string;
  version: string;
  tools: ToolDefinition<TClient>[];
  client: TClient;
  logger?: Logger;
  audit?: AuditWriter;
}

export async function runMcpServer<TClient>(opts: RunMcpServerOptions<TClient>): Promise<void> {
  const logger = opts.logger ?? createLogger({ server: opts.name });
  const audit = opts.audit ?? selectAuditWriter(logger);
  const tools = opts.tools;

  const server = new Server(
    { name: `atif-mcp-${opts.name}`, version: opts.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    const tool = tools.find((t) => t.name === name);
    const startedAt = Date.now();

    if (!tool) {
      const message = `Unknown tool: ${name}`;
      audit.write({
        server: opts.name,
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
      const result = await tool.handler(opts.client, args);
      audit.write({
        server: opts.name,
        tool: name,
        args,
        response: result.data,
        durationMs: Date.now() - startedAt,
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
      const { message, code, meta } = unwrapError(err);
      audit.write({
        server: opts.name,
        tool: name,
        args,
        response: null,
        durationMs: Date.now() - startedAt,
        status: "error",
        errorCode: code,
        errorMessage: message,
      });
      logger.warn("tool call failed", { tool: name, code, message });
      return errorResult(message, meta);
    }
  });

  const shutdown = (): void => {
    audit.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`${opts.name} mcp server connected`, { tools: tools.map((t) => t.name) });
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
