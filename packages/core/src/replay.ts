#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { optionalEnv } from "./auth.js";

interface AuditRow {
  id: number;
  ts: string;
  server: string;
  tool: string;
  args_json: string;
  response_json: string;
  duration_ms: number;
  status: string;
  error_code: string | null;
  error_message: string | null;
}

interface Args {
  server: string | null;
  tool: string | null;
  limit: number;
  db: string | null;
  showArgs: boolean;
  showResponse: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    server: null,
    tool: null,
    limit: 20,
    db: null,
    showArgs: false,
    showResponse: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--server") out.server = argv[++i] ?? null;
    else if (a === "--tool") out.tool = argv[++i] ?? null;
    else if (a === "--limit") out.limit = Number.parseInt(argv[++i] ?? "20", 10);
    else if (a === "--db") out.db = argv[++i] ?? null;
    else if (a === "--args") out.showArgs = true;
    else if (a === "--response") out.showResponse = true;
  }
  return out;
}

const HELP = `
atif-mcp-replay [options]

Print the most recent MCP tool calls from the audit log.

  --server <name>    Filter by server (github, linear, gmail)
  --tool <name>      Filter by tool name (e.g. repo.search)
  --limit <n>        Number of rows, default 20
  --db <path>        SQLite path (default ~/.mcp-toolkit/audit.db)
  --args             Show args JSON for each row
  --response         Show response JSON for each row
  --help             Show this message
`;

function defaultDbPath(): string {
  return optionalEnv("MCP_TOOLKIT_AUDIT_DB") ?? join(homedir(), ".mcp-toolkit", "audit.db");
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function formatRow(row: AuditRow, showArgs: boolean, showResponse: boolean): string {
  const status = row.status === "ok" ? "ok " : "ERR";
  const dur = `${row.duration_ms}ms`;
  const idCol = pad(`[${row.id}]`, 6);
  const serverCol = pad(row.server, 8);
  const toolCol = pad(row.tool, 16);
  const statusCol = pad(status, 4);
  const lines = [`${idCol}${row.ts}  ${serverCol}${toolCol}${statusCol}${pad(dur, 9)}`];
  if (row.status === "error") {
    lines.push(`       error: ${row.error_code} ${row.error_message ?? ""}`);
  }
  if (showArgs) lines.push(`       args: ${row.args_json}`);
  if (showResponse) lines.push(`       resp: ${row.response_json}`);
  return lines.join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const dbPath = args.db ?? defaultDbPath();
  const db = new Database(dbPath, { readonly: true });

  const wheres: string[] = [];
  const params: unknown[] = [];
  if (args.server) {
    wheres.push("server = ?");
    params.push(args.server);
  }
  if (args.tool) {
    wheres.push("tool = ?");
    params.push(args.tool);
  }
  const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";
  const sql = `SELECT * FROM audit_log ${whereSql} ORDER BY id DESC LIMIT ?`;
  params.push(args.limit);

  const rows = db.prepare(sql).all(...params) as AuditRow[];
  if (rows.length === 0) {
    process.stdout.write("no matching audit rows\n");
    db.close();
    return;
  }

  process.stdout.write(`${pad("id", 6)}${pad("timestamp", 26)}${pad("server", 8)}${pad("tool", 16)}${pad("st", 4)}${pad("dur", 9)}\n`);
  for (const row of rows) {
    process.stdout.write(`${formatRow(row, args.showArgs, args.showResponse)}\n`);
  }
  db.close();
}

main();
