import type { ToolDefinition as CoreToolDefinition } from "atif-mcp-core";
import type { GmailClient } from "./gmail-client.js";

type ToolDefinition = CoreToolDefinition<GmailClient>;

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Argument "${key}" must be a non-empty string.`);
  }
  return v;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new Error(`Argument "${key}" must be a string.`);
  return v;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Argument "${key}" must be a number.`);
  }
  return v;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new Error(`Argument "${key}" must be an array of strings.`);
  }
  return v as string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

interface MessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
  nextPageToken?: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

interface ModifyResponse {
  id: string;
  threadId: string;
  labelIds: string[];
}

function decodeBase64Url(s: string): string {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function encodeBase64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function extractTextBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  if (part.parts) {
    const plain = part.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    for (const sub of part.parts) {
      const nested = extractTextBody(sub);
      if (nested) return nested;
    }
  }
  if (part.mimeType?.startsWith("text/") && part.body?.data) return decodeBase64Url(part.body.data);
  return "";
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === lower);
  return found?.value ?? "";
}

function buildRawEmail(to: string, subject: string, body: string, cc?: string, bcc?: string): string {
  const lines = [`To: ${to}`];
  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("");
  lines.push(body);
  return encodeBase64Url(lines.join("\r\n"));
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "message.list",
    description:
      "List Gmail message IDs matching a query. Same query syntax as gmail.com search (e.g. 'from:noreply@github.com is:unread newer_than:7d'). Returns ids, threadIds, and a result size estimate.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query." },
        label_ids: { type: "array", items: { type: "string" }, description: "Filter by label IDs (e.g. INBOX, UNREAD)." },
        limit: { type: "number", description: "Max message ids, 1 to 100. Defaults to 25." },
      },
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const query = optionalString(args, "query");
      const labelIds = optionalStringArray(args, "label_ids");
      const limit = clamp(optionalNumber(args, "limit") ?? 25, 1, 100);
      const queryParams: Record<string, string | number | undefined> = { maxResults: limit };
      if (query) queryParams.q = query;
      if (labelIds && labelIds.length > 0) queryParams.labelIds = labelIds.join(",");

      const res = await client.request<MessageListResponse>("GET", "/gmail/v1/users/me/messages", {
        query: queryParams,
      });
      return {
        data: {
          total_estimate: res.data.resultSizeEstimate ?? 0,
          messages: res.data.messages ?? [],
        },
        rateLimit: res.rateLimit,
      };
    },
  },
  {
    name: "message.read",
    description:
      "Read a Gmail message by id. Returns from, to, subject, date, snippet, labels, and the plain-text body. Use message.list to find ids.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "Gmail message ID (from message.list)." },
      },
      required: ["message_id"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const id = requireString(args, "message_id");
      const res = await client.request<GmailMessage>("GET", `/gmail/v1/users/me/messages/${id}`, {
        query: { format: "full" },
      });
      const headers = res.data.payload?.headers;
      const body = extractTextBody(res.data.payload);
      return {
        data: {
          id: res.data.id,
          thread_id: res.data.threadId,
          labels: res.data.labelIds ?? [],
          from: headerValue(headers, "From"),
          to: headerValue(headers, "To"),
          subject: headerValue(headers, "Subject"),
          date: headerValue(headers, "Date"),
          snippet: res.data.snippet ?? "",
          body,
        },
        rateLimit: res.rateLimit,
      };
    },
  },
  {
    name: "message.send",
    description:
      "Send a plain-text Gmail message. Authenticated user is the From address. Returns the sent message id and threadId.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string", description: "Email subject." },
        body: { type: "string", description: "Plain-text body." },
        cc: { type: "string", description: "CC address, optional." },
        bcc: { type: "string", description: "BCC address, optional." },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const to = requireString(args, "to");
      const subject = requireString(args, "subject");
      const body = requireString(args, "body");
      const cc = optionalString(args, "cc");
      const bcc = optionalString(args, "bcc");
      const raw = buildRawEmail(to, subject, body, cc, bcc);
      const res = await client.request<{ id: string; threadId: string; labelIds?: string[] }>(
        "POST",
        "/gmail/v1/users/me/messages/send",
        { body: { raw } },
      );
      return {
        data: { id: res.data.id, thread_id: res.data.threadId, labels: res.data.labelIds ?? [] },
        rateLimit: res.rateLimit,
      };
    },
  },
  {
    name: "label.apply",
    description:
      "Apply and / or remove labels on a Gmail message. Both add and remove are optional but at least one must be set. Label IDs are uppercase strings like INBOX, UNREAD, IMPORTANT, or custom Label_NNN values.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "Gmail message ID." },
        add: { type: "array", items: { type: "string" }, description: "Label IDs to add." },
        remove: { type: "array", items: { type: "string" }, description: "Label IDs to remove." },
      },
      required: ["message_id"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const id = requireString(args, "message_id");
      const add = optionalStringArray(args, "add") ?? [];
      const remove = optionalStringArray(args, "remove") ?? [];
      if (add.length === 0 && remove.length === 0) {
        throw new Error('label.apply requires at least one of "add" or "remove".');
      }
      const payload: Record<string, unknown> = {};
      if (add.length > 0) payload.addLabelIds = add;
      if (remove.length > 0) payload.removeLabelIds = remove;

      const res = await client.request<ModifyResponse>(
        "POST",
        `/gmail/v1/users/me/messages/${id}/modify`,
        { body: payload },
      );
      return {
        data: { id: res.data.id, thread_id: res.data.threadId, labels: res.data.labelIds },
        rateLimit: res.rateLimit,
      };
    },
  },
];
