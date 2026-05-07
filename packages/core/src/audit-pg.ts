import type { AuditEntry, AuditWriter } from "./audit.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    server TEXT NOT NULL,
    tool TEXT NOT NULL,
    args_json JSONB NOT NULL,
    response_json JSONB NOT NULL,
    duration_ms INTEGER NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT
  );
  CREATE INDEX IF NOT EXISTS audit_log_server_ts ON audit_log(server, ts DESC);
  CREATE INDEX IF NOT EXISTS audit_log_tool_ts ON audit_log(tool, ts DESC);
`;

export class PgAuditWriter implements AuditWriter {
  private readonly client: { query: (text: string, values?: unknown[]) => Promise<unknown> };
  private readonly closeFn: () => Promise<void>;
  private ready: Promise<void>;
  private readonly insertSql = `
    INSERT INTO audit_log
      (server, tool, args_json, response_json, duration_ms, status, error_code, error_message)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
  `;

  private constructor(
    client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
    closeFn: () => Promise<void>,
  ) {
    this.client = client;
    this.closeFn = closeFn;
    this.ready = client.query(SCHEMA).then(() => undefined);
  }

  static async connect(connectionString: string): Promise<PgAuditWriter> {
    const { Client } = await import("pg");
    const client = new Client({ connectionString });
    await client.connect();
    return new PgAuditWriter(client, () => client.end());
  }

  write(entry: AuditEntry): void {
    void this.ready
      .then(() =>
        this.client.query(this.insertSql, [
          entry.server,
          entry.tool,
          JSON.stringify(entry.args ?? null),
          JSON.stringify(entry.response ?? null),
          entry.durationMs,
          entry.status,
          entry.errorCode ?? null,
          entry.errorMessage ?? null,
        ]),
      )
      .catch(() => {
        // Audit must never block the tool response. Drop silently on write failure.
      });
  }

  close(): void {
    void this.closeFn().catch(() => {});
  }
}
