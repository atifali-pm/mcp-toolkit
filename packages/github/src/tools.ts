import type { GitHubClient, RateLimit } from "./github-client.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
  handler: (client: GitHubClient, args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  data: unknown;
  rateLimit: RateLimit;
}

interface IssueSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  user?: { login: string };
  labels?: Array<{ name: string } | string>;
  body?: string | null;
}

interface RepoSummary {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  html_url: string;
}

interface ReviewSummary {
  id: number;
  state: string;
  html_url: string;
  body: string | null;
}

const issueShape = (i: IssueSummary) => ({
  number: i.number,
  title: i.title,
  state: i.state,
  url: i.url,
  author: i.user?.login,
  labels: (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
});

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

function requireNumber(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Argument "${key}" must be a number.`);
  }
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

export const TOOLS: ToolDefinition[] = [
  {
    name: "issue.list",
    description:
      "List issues in a GitHub repository. Returns issue number, title, state, author, labels, and URL. Use state to filter open/closed/all.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or org)." },
        repo: { type: "string", description: "Repository name." },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state filter. Defaults to open." },
        labels: { type: "array", items: { type: "string" }, description: "Filter by these label names." },
        limit: { type: "number", description: "Max issues to return, 1 to 100. Defaults to 30." },
      },
      required: ["owner", "repo"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const owner = requireString(args, "owner");
      const repo = requireString(args, "repo");
      const state = optionalString(args, "state") ?? "open";
      const labels = optionalStringArray(args, "labels");
      const limit = optionalNumber(args, "limit") ?? 30;
      const res = await client.request<IssueSummary[]>("GET", `/repos/${owner}/${repo}/issues`, {
        query: {
          state,
          labels: labels?.join(","),
          per_page: Math.max(1, Math.min(100, limit)),
        },
      });
      return { data: res.data.map(issueShape), rateLimit: res.rateLimit };
    },
  },
  {
    name: "issue.create",
    description:
      "Create a new GitHub issue. Returns the new issue number and URL. Use labels to tag it on creation.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner." },
        repo: { type: "string", description: "Repository name." },
        title: { type: "string", description: "Issue title." },
        body: { type: "string", description: "Issue body, markdown." },
        labels: { type: "array", items: { type: "string" }, description: "Labels to apply." },
      },
      required: ["owner", "repo", "title"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const owner = requireString(args, "owner");
      const repo = requireString(args, "repo");
      const title = requireString(args, "title");
      const body = optionalString(args, "body");
      const labels = optionalStringArray(args, "labels");
      const payload: Record<string, unknown> = { title };
      if (body !== undefined) payload.body = body;
      if (labels !== undefined) payload.labels = labels;
      const res = await client.request<IssueSummary>("POST", `/repos/${owner}/${repo}/issues`, {
        body: payload,
      });
      return { data: issueShape(res.data), rateLimit: res.rateLimit };
    },
  },
  {
    name: "issue.update",
    description:
      "Update an existing GitHub issue. Any field omitted is left unchanged. Set state to 'closed' to close.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner." },
        repo: { type: "string", description: "Repository name." },
        issue_number: { type: "number", description: "Issue number." },
        title: { type: "string", description: "New title." },
        body: { type: "string", description: "New body." },
        state: { type: "string", enum: ["open", "closed"], description: "New state." },
        labels: { type: "array", items: { type: "string" }, description: "Replace labels with this list." },
      },
      required: ["owner", "repo", "issue_number"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const owner = requireString(args, "owner");
      const repo = requireString(args, "repo");
      const issueNumber = requireNumber(args, "issue_number");
      const payload: Record<string, unknown> = {};
      const title = optionalString(args, "title");
      const body = optionalString(args, "body");
      const state = optionalString(args, "state");
      const labels = optionalStringArray(args, "labels");
      if (title !== undefined) payload.title = title;
      if (body !== undefined) payload.body = body;
      if (state !== undefined) payload.state = state;
      if (labels !== undefined) payload.labels = labels;
      const res = await client.request<IssueSummary>(
        "PATCH",
        `/repos/${owner}/${repo}/issues/${issueNumber}`,
        { body: payload },
      );
      return { data: issueShape(res.data), rateLimit: res.rateLimit };
    },
  },
  {
    name: "pr.review",
    description:
      "Submit a review on a pull request. Use event APPROVE, REQUEST_CHANGES, or COMMENT. Body is required for REQUEST_CHANGES and COMMENT.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner." },
        repo: { type: "string", description: "Repository name." },
        pull_number: { type: "number", description: "Pull request number." },
        event: {
          type: "string",
          enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"],
          description: "Review verdict.",
        },
        body: { type: "string", description: "Review body, markdown." },
      },
      required: ["owner", "repo", "pull_number", "event"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const owner = requireString(args, "owner");
      const repo = requireString(args, "repo");
      const pullNumber = requireNumber(args, "pull_number");
      const event = requireString(args, "event");
      const body = optionalString(args, "body");
      if ((event === "REQUEST_CHANGES" || event === "COMMENT") && !body) {
        throw new Error(`event "${event}" requires a non-empty body.`);
      }
      const payload: Record<string, unknown> = { event };
      if (body !== undefined) payload.body = body;
      const res = await client.request<ReviewSummary>(
        "POST",
        `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
        { body: payload },
      );
      return {
        data: {
          id: res.data.id,
          state: res.data.state,
          url: res.data.html_url,
          body: res.data.body,
        },
        rateLimit: res.rateLimit,
      };
    },
  },
  {
    name: "repo.search",
    description:
      "Search GitHub repositories using the same query syntax as github.com/search. Returns full_name, description, stars, URL.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query, e.g. 'mcp server language:typescript stars:>50'." },
        limit: { type: "number", description: "Max results, 1 to 50. Defaults to 10." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const query = requireString(args, "query");
      const limit = optionalNumber(args, "limit") ?? 10;
      const res = await client.request<{ items: RepoSummary[]; total_count: number }>(
        "GET",
        "/search/repositories",
        { query: { q: query, per_page: Math.max(1, Math.min(50, limit)) } },
      );
      return {
        data: {
          total: res.data.total_count,
          items: res.data.items.map((r) => ({
            full_name: r.full_name,
            description: r.description,
            stars: r.stargazers_count,
            url: r.html_url,
          })),
        },
        rateLimit: res.rateLimit,
      };
    },
  },
];
