export class McpToolError extends Error {
  readonly code: string;
  readonly status: number;
  readonly meta?: Record<string, unknown>;

  constructor(code: string, message: string, status = 500, meta?: Record<string, unknown>) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.status = status;
    if (meta !== undefined) {
      this.meta = meta;
    }
  }
}

export class RateLimitError extends McpToolError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super("rate_limit", message, 429, meta);
    this.name = "RateLimitError";
  }
}

export class AuthError extends McpToolError {
  constructor(message: string) {
    super("auth", message, 401);
    this.name = "AuthError";
  }
}

export class NotFoundError extends McpToolError {
  constructor(message: string) {
    super("not_found", message, 404);
    this.name = "NotFoundError";
  }
}
