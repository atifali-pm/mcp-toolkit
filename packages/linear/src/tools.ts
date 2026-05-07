import type { LinearClient, RateLimit } from "./linear-client.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
  handler: (client: LinearClient, args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  data: unknown;
  rateLimit: RateLimit;
}

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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string; type: string };
  assignee: { name: string } | null;
  team: { key: string; name: string };
  priority: number;
  createdAt: string;
}

interface ProjectNode {
  id: string;
  name: string;
  state: string;
  url: string;
  progress: number;
  startDate: string | null;
  targetDate: string | null;
  lead: { name: string } | null;
}

interface TeamNode {
  id: string;
  key: string;
  name: string;
  description: string | null;
  private: boolean;
  issueCount: number;
}

const ISSUE_FIELDS = `
  id
  identifier
  title
  url
  priority
  createdAt
  state { name type }
  assignee { name }
  team { key name }
`;

export const TOOLS: ToolDefinition[] = [
  {
    name: "issue.list",
    description:
      "List Linear issues, optionally filtered by team key (e.g. 'ENG'), state name, or assignee email. Returns identifier, title, state, assignee, team, priority, URL.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Team key, like 'ENG' or 'OPS'." },
        state: { type: "string", description: "State name to match exactly, like 'In Progress'." },
        assignee_email: { type: "string", description: "Assignee email, exact match." },
        limit: { type: "number", description: "Max issues, 1 to 100. Defaults to 25." },
      },
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const team = optionalString(args, "team");
      const state = optionalString(args, "state");
      const assigneeEmail = optionalString(args, "assignee_email");
      const limit = clamp(optionalNumber(args, "limit") ?? 25, 1, 100);

      const filter: Record<string, unknown> = {};
      if (team) filter.team = { key: { eq: team } };
      if (state) filter.state = { name: { eq: state } };
      if (assigneeEmail) filter.assignee = { email: { eq: assigneeEmail } };

      const query = `
        query Issues($first: Int!, $filter: IssueFilter) {
          issues(first: $first, filter: $filter) {
            nodes { ${ISSUE_FIELDS} }
          }
        }
      `;
      const res = await client.query<{ issues: { nodes: IssueNode[] } }>(query, {
        first: limit,
        filter: Object.keys(filter).length > 0 ? filter : null,
      });
      return {
        data: res.data.issues.nodes.map(shapeIssue),
        rateLimit: res.rateLimit,
      };
    },
  },
  {
    name: "issue.create",
    description:
      "Create a new Linear issue. Requires team_id (UUID, fetch from team.query first). Returns the new issue identifier and URL.",
    inputSchema: {
      type: "object",
      properties: {
        team_id: { type: "string", description: "Linear team UUID. Get from team.query." },
        title: { type: "string", description: "Issue title." },
        description: { type: "string", description: "Markdown body." },
        priority: {
          type: "number",
          description: "0=none, 1=urgent, 2=high, 3=medium, 4=low.",
        },
        assignee_id: { type: "string", description: "Assignee user UUID, optional." },
      },
      required: ["team_id", "title"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const teamId = requireString(args, "team_id");
      const title = requireString(args, "title");
      const description = optionalString(args, "description");
      const priority = optionalNumber(args, "priority");
      const assigneeId = optionalString(args, "assignee_id");
      const input: Record<string, unknown> = { teamId, title };
      if (description !== undefined) input.description = description;
      if (priority !== undefined) input.priority = priority;
      if (assigneeId !== undefined) input.assigneeId = assigneeId;

      const query = `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { ${ISSUE_FIELDS} }
          }
        }
      `;
      const res = await client.query<{ issueCreate: { success: boolean; issue: IssueNode } }>(query, {
        input,
      });
      if (!res.data.issueCreate.success) {
        throw new Error("Linear rejected the issue creation.");
      }
      return { data: shapeIssue(res.data.issueCreate.issue), rateLimit: res.rateLimit };
    },
  },
  {
    name: "project.query",
    description:
      "List Linear projects. Returns name, state, progress (0-1), start and target dates, lead, URL.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Substring match on project name." },
        limit: { type: "number", description: "Max projects, 1 to 100. Defaults to 25." },
      },
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const name = optionalString(args, "name");
      const limit = clamp(optionalNumber(args, "limit") ?? 25, 1, 100);
      const filter: Record<string, unknown> = {};
      if (name) filter.name = { containsIgnoreCase: name };

      const query = `
        query Projects($first: Int!, $filter: ProjectFilter) {
          projects(first: $first, filter: $filter) {
            nodes {
              id
              name
              state
              url
              progress
              startDate
              targetDate
              lead { name }
            }
          }
        }
      `;
      const res = await client.query<{ projects: { nodes: ProjectNode[] } }>(query, {
        first: limit,
        filter: Object.keys(filter).length > 0 ? filter : null,
      });
      return {
        data: res.data.projects.nodes.map((p) => ({
          id: p.id,
          name: p.name,
          state: p.state,
          progress: p.progress,
          start_date: p.startDate,
          target_date: p.targetDate,
          lead: p.lead?.name ?? null,
          url: p.url,
        })),
        rateLimit: res.rateLimit,
      };
    },
  },
  {
    name: "team.query",
    description:
      "List Linear teams. Returns id (UUID for issue.create), key (short prefix), name, description, issue count, privacy flag.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max teams, 1 to 100. Defaults to 50." },
      },
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const limit = clamp(optionalNumber(args, "limit") ?? 50, 1, 100);
      const query = `
        query Teams($first: Int!) {
          teams(first: $first) {
            nodes {
              id
              key
              name
              description
              private
              issueCount
            }
          }
        }
      `;
      const res = await client.query<{ teams: { nodes: TeamNode[] } }>(query, { first: limit });
      return {
        data: res.data.teams.nodes.map((t) => ({
          id: t.id,
          key: t.key,
          name: t.name,
          description: t.description,
          private: t.private,
          issue_count: t.issueCount,
        })),
        rateLimit: res.rateLimit,
      };
    },
  },
];

function shapeIssue(i: IssueNode) {
  return {
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    url: i.url,
    state: i.state.name,
    state_type: i.state.type,
    assignee: i.assignee?.name ?? null,
    team: `${i.team.key} (${i.team.name})`,
    priority: i.priority,
    created_at: i.createdAt,
  };
}
