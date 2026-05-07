#!/usr/bin/env node
import { requireEnv, runMcpServer } from "@mcp-toolkit/core";
import { GitHubClient } from "./github-client.js";
import { TOOLS } from "./tools.js";

const token = requireEnv(
  "GITHUB_TOKEN",
  "Create a personal access token at https://github.com/settings/tokens with repo + read:org scopes.",
);

await runMcpServer({
  name: "github",
  version: "0.0.1",
  tools: TOOLS,
  client: new GitHubClient({ token }),
});
