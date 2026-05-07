import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type AuditWriter, SqliteAuditWriter, noopAuditWriter } from "./audit.js";
import { PgAuditWriter } from "./audit-pg.js";
import { optionalEnv } from "./auth.js";
import type { Logger } from "./logger.js";

export function selectAuditWriter(logger?: Logger): AuditWriter {
  const driver = optionalEnv("MCP_TOOLKIT_AUDIT_DRIVER")?.toLowerCase();
  const override = optionalEnv("MCP_TOOLKIT_AUDIT_DB");
  if (override === "off") return noopAuditWriter;

  if (driver === "postgres" || driver === "pg") {
    const url = optionalEnv("MCP_TOOLKIT_AUDIT_URL");
    if (!url) {
      logger?.warn(
        "MCP_TOOLKIT_AUDIT_DRIVER=postgres requires MCP_TOOLKIT_AUDIT_URL; falling back to sqlite",
      );
    } else {
      let real: AuditWriter | undefined;
      const lazy: AuditWriter = {
        write(entry) {
          real?.write(entry);
        },
        close() {
          real?.close();
        },
      };
      PgAuditWriter.connect(url)
        .then((connected) => {
          real = connected;
        })
        .catch((err: unknown) => {
          logger?.warn("postgres audit writer failed to connect", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return lazy;
    }
  }

  const path = override ?? defaultSqlitePath();
  try {
    return new SqliteAuditWriter(path);
  } catch (err) {
    logger?.warn("audit writer disabled", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    return noopAuditWriter;
  }
}

function defaultSqlitePath(): string {
  const dir = join(homedir(), ".mcp-toolkit");
  mkdirSync(dir, { recursive: true });
  return join(dir, "audit.db");
}
