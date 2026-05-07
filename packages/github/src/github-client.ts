import { AuthError, NotFoundError, RateLimitError, McpToolError } from "@mcp-toolkit/core";

const GITHUB_API = "https://api.github.com";

export interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface GitHubResponse<T> {
  data: T;
  rateLimit: RateLimit;
}

export interface GitHubClientOptions {
  token: string;
  userAgent?: string;
}

export class GitHubClient {
  private readonly token: string;
  private readonly userAgent: string;

  constructor(opts: GitHubClientOptions) {
    this.token = opts.token;
    this.userAgent = opts.userAgent ?? "atif-mcp-github/0.0.1";
  }

  async request<T>(
    method: string,
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<GitHubResponse<T>> {
    const url = new URL(path.startsWith("http") ? path : `${GITHUB_API}${path}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "User-Agent": this.userAgent,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const fetchInit: RequestInit = { method, headers };
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchInit.body = JSON.stringify(init.body);
    }

    const res = await fetch(url, fetchInit);
    const rateLimit = readRateLimit(res.headers);
    const text = await res.text();
    const parsed = text.length > 0 ? safeJson(text) : null;

    if (!res.ok) {
      throw mapError(res.status, parsed, rateLimit);
    }
    return { data: parsed as T, rateLimit };
  }
}

function readRateLimit(headers: Headers): RateLimit {
  const remaining = Number.parseInt(headers.get("x-ratelimit-remaining") ?? "-1", 10);
  const limit = Number.parseInt(headers.get("x-ratelimit-limit") ?? "-1", 10);
  const reset = Number.parseInt(headers.get("x-ratelimit-reset") ?? "0", 10);
  const resetAt = reset > 0 ? new Date(reset * 1000).toISOString() : "";
  return { remaining, limit, resetAt };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapError(status: number, body: unknown, rateLimit: RateLimit): McpToolError {
  const message = extractMessage(body) ?? `GitHub API error ${status}`;

  if (status === 401 || status === 403) {
    if (rateLimit.remaining === 0) {
      return new RateLimitError(
        `GitHub rate limit exhausted. Limit ${rateLimit.limit}, resets at ${rateLimit.resetAt}.`,
        { ...rateLimit, status },
      );
    }
    if (status === 401) return new AuthError(message);
    return new McpToolError("forbidden", message, status, { ...rateLimit });
  }
  if (status === 404) return new NotFoundError(message);
  if (status === 429) {
    return new RateLimitError(
      `GitHub secondary rate limit. ${message} Resets at ${rateLimit.resetAt}.`,
      { ...rateLimit, status },
    );
  }
  return new McpToolError(`http_${status}`, message, status, { ...rateLimit });
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return undefined;
}
