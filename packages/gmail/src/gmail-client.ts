import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { OAuth2Client } from "google-auth-library";
import { AuthError, McpToolError, NotFoundError, RateLimitError } from "atif-mcp-core";

const GMAIL_API = "https://gmail.googleapis.com";

export interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface GmailResponse<T> {
  data: T;
  rateLimit: RateLimit;
}

export interface StoredTokens {
  access_token?: string;
  refresh_token: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

export interface GmailClientOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokensPath: string;
  userAgent?: string;
}

export class GmailClient {
  private readonly oauth: OAuth2Client;
  private readonly tokensPath: string;
  private readonly userAgent: string;

  constructor(opts: GmailClientOptions) {
    this.oauth = new OAuth2Client(opts.clientId, opts.clientSecret, opts.redirectUri);
    this.tokensPath = opts.tokensPath;
    this.userAgent = opts.userAgent ?? "atif-mcp-gmail/0.1.0";

    const stored = loadTokens(this.tokensPath);
    if (stored) {
      this.oauth.setCredentials(stored);
      this.oauth.on("tokens", (next) => {
        const merged: StoredTokens = { ...stored, ...(next as StoredTokens) };
        if (!merged.refresh_token && stored.refresh_token) merged.refresh_token = stored.refresh_token;
        saveTokens(this.tokensPath, merged);
      });
    }
  }

  hasCredentials(): boolean {
    return existsSync(this.tokensPath);
  }

  generateAuthUrl(scopes: string[]): string {
    return this.oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
    });
  }

  async exchangeCode(code: string): Promise<void> {
    const { tokens } = await this.oauth.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh_token. Revoke the app at https://myaccount.google.com/permissions and retry to force a fresh consent.",
      );
    }
    this.oauth.setCredentials(tokens);
    saveTokens(this.tokensPath, tokens as StoredTokens);
  }

  async request<T>(
    method: string,
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<GmailResponse<T>> {
    const tokenInfo = await this.oauth.getAccessToken();
    const accessToken = tokenInfo.token;
    if (!accessToken) throw new AuthError("Failed to acquire Gmail access token. Re-run the consent flow.");

    const url = new URL(path.startsWith("http") ? path : `${GMAIL_API}${path}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
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

function loadTokens(path: string): StoredTokens | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as StoredTokens;
  } catch {
    return null;
  }
}

function saveTokens(path: string, tokens: StoredTokens): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function defaultTokensPath(): string {
  return join(homedir(), ".mcp-toolkit", "gmail-tokens.json");
}

function readRateLimit(_headers: Headers): RateLimit {
  // Gmail does not expose a per-call quota header. Quota is enforced per project at 1 billion quota
  // units per day, ~250 units per second per user. Surfaced as -1 to signal "not provided".
  return { remaining: -1, limit: -1, resetAt: "" };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapError(status: number, body: unknown, rateLimit: RateLimit): McpToolError {
  const message = extractMessage(body) ?? `Gmail API error ${status}`;
  if (status === 401) return new AuthError(message);
  if (status === 403) {
    const reason = extractReason(body);
    if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
      return new RateLimitError(`Gmail rate limit hit. ${message}`, { ...rateLimit, status, reason });
    }
    return new McpToolError("forbidden", message, status, { ...rateLimit });
  }
  if (status === 404) return new NotFoundError(message);
  if (status === 429) return new RateLimitError(`Gmail rate limit hit. ${message}`, { ...rateLimit, status });
  return new McpToolError(`http_${status}`, message, status, { ...rateLimit });
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const err = (body as { error?: { message?: string } }).error;
    if (err && typeof err.message === "string") return err.message;
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return undefined;
}

function extractReason(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const err = (body as { error?: { errors?: Array<{ reason?: string }> } }).error;
    if (err?.errors && err.errors.length > 0) {
      const first = err.errors[0];
      if (first && typeof first.reason === "string") return first.reason;
    }
  }
  return undefined;
}
