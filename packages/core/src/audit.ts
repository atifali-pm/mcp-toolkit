import Database from "better-sqlite3";

export interface AuditEntry {
  server: string;
  tool: string;
  args: unknown;
  response: unknown;
  durationMs: number;
  status: "ok" | "error";
  errorCode?: string;
  errorMessage?: string;
}

export interface AuditWriter {
  write(entry: AuditEntry): void;
  close(): void;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    server TEXT NOT NULL,
    tool TEXT NOT NULL,
    args_json TEXT NOT NULL,
    response_json TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT
  );
  CREATE INDEX IF NOT EXISTS audit_log_server_ts ON audit_log(server, ts DESC);
  CREATE INDEX IF NOT EXISTS audit_log_tool_ts ON audit_log(tool, ts DESC);
`;

export class SqliteAuditWriter implements AuditWriter {
  private readonly db: Database.Database;
  private readonly insertStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_log
        (server, tool, args_json, response_json, duration_ms, status, error_code, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  write(entry: AuditEntry): void {
    try {
      this.insertStmt.run(
        entry.server,
        entry.tool,
        JSON.stringify(entry.args ?? null),
        JSON.stringify(entry.response ?? null),
        entry.durationMs,
        entry.status,
        entry.errorCode ?? null,
        entry.errorMessage ?? null,
      );
    } catch {
      // Audit must never block the tool response. Drop silently on write failure.
    }
  }

  close(): void {
    this.db.close();
  }
}

export const noopAuditWriter: AuditWriter = {
  write: () => {},
  close: () => {},
};
