export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: boolean;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface ToolResult {
  data: unknown;
  rateLimit: RateLimitInfo;
}

export interface ToolDefinition<TClient> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (client: TClient, args: Record<string, unknown>) => Promise<ToolResult>;
}
