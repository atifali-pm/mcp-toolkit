import { AuthError, McpToolError, NotFoundError, RateLimitError } from "atif-mcp-core";

const LINEAR_API = "https://api.linear.app/graphql";

export interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: string;
  complexityRemaining?: number;
  complexityLimit?: number;
}

export interface LinearResponse<T> {
  data: T;
  rateLimit: RateLimit;
}

export interface LinearClientOptions {
  apiKey: string;
  userAgent?: string;
}

interface GraphQLError {
  message: string;
  extensions?: { code?: string; type?: string };
  path?: Array<string | number>;
}

export class LinearClient {
  private readonly apiKey: string;
  private readonly userAgent: string;

  constructor(opts: LinearClientOptions) {
    this.apiKey = opts.apiKey;
    this.userAgent = opts.userAgent ?? "atif-mcp-linear/0.0.1";
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<LinearResponse<T>> {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
        "User-Agent": this.userAgent,
      },
      body: JSON.stringify({ query, variables }),
    });

    const rateLimit = readRateLimit(res.headers);
    const text = await res.text();
    const parsed = text.length > 0 ? safeJson(text) : null;

    if (!res.ok) {
      throw mapHttpError(res.status, parsed, rateLimit);
    }

    if (parsed && typeof parsed === "object" && "errors" in parsed) {
      const errors = (parsed as { errors: GraphQLError[] }).errors;
      if (Array.isArray(errors) && errors.length > 0) {
        throw mapGraphqlError(errors, rateLimit);
      }
    }

    const data = (parsed as { data?: T } | null)?.data;
    if (data === undefined || data === null) {
      throw new McpToolError("empty_response", "Linear returned no data.", 502, { ...rateLimit });
    }
    return { data, rateLimit };
  }
}

function readRateLimit(headers: Headers): RateLimit {
  const remaining = parseIntHeader(headers, "x-ratelimit-requests-remaining");
  const limit = parseIntHeader(headers, "x-ratelimit-requests-limit");
  const reset = parseIntHeader(headers, "x-ratelimit-requests-reset");
  const complexityRemaining = parseIntHeader(headers, "x-complexity-remaining");
  const complexityLimit = parseIntHeader(headers, "x-complexity-limit");
  const resetAt = reset > 0 ? new Date(reset).toISOString() : "";
  const out: RateLimit = { remaining, limit, resetAt };
  if (complexityRemaining >= 0) out.complexityRemaining = complexityRemaining;
  if (complexityLimit >= 0) out.complexityLimit = complexityLimit;
  return out;
}

function parseIntHeader(headers: Headers, key: string): number {
  const raw = headers.get(key);
  if (!raw) return -1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : -1;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapHttpError(status: number, body: unknown, rateLimit: RateLimit): McpToolError {
  const message = extractMessage(body) ?? `Linear API error ${status}`;
  if (status === 401) return new AuthError(message);
  if (status === 403) return new McpToolError("forbidden", message, status, { ...rateLimit });
  if (status === 404) return new NotFoundError(message);
  if (status === 429) {
    return new RateLimitError(
      `Linear rate limit hit. ${message} Resets at ${rateLimit.resetAt}.`,
      { ...rateLimit, status },
    );
  }
  return new McpToolError(`http_${status}`, message, status, { ...rateLimit });
}

function mapGraphqlError(errors: GraphQLError[], rateLimit: RateLimit): McpToolError {
  const first = errors[0];
  const code = first?.extensions?.code ?? first?.extensions?.type ?? "graphql_error";
  const message = errors.map((e) => e.message).join("; ");
  if (code === "AUTHENTICATION_ERROR" || code === "AUTH_ERROR") return new AuthError(message);
  if (code === "RATELIMITED" || code === "RATE_LIMIT") {
    return new RateLimitError(message, { ...rateLimit });
  }
  if (code === "NOT_FOUND") return new NotFoundError(message);
  return new McpToolError(String(code), message, 400, { ...rateLimit });
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      const first = obj.errors[0] as { message?: unknown };
      if (typeof first.message === "string") return first.message;
    }
  }
  return undefined;
}
