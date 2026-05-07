export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

interface LoggerOptions {
  server: string;
  minLevel?: Level;
}

export function createLogger(options: LoggerOptions): Logger {
  const minLevel = LEVELS[options.minLevel ?? "info"];
  function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
    if (LEVELS[level] < minLevel) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      server: options.server,
      message,
      ...fields,
    };
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  }
  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}
