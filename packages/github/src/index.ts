#!/usr/bin/env node
import { handleCli, requireEnv, runMcpServer } from "atif-mcp-core";
import { GitHubClient } from "./github-client.js";
import { TOOLS } from "./tools.js";

const VERSION = "0.1.0";

if (
  handleCli({
    serverName: "github",
    binName: "atif-mcp-github",
    version: VERSION,
    env: [
      {
        name: "GITHUB_TOKEN",
        description: "GitHub personal access token with repo + read:org scopes",
      },
    ],
  })
) {
  process.exit(0);
}

const token = requireEnv(
  "GITHUB_TOKEN",
  "Create a personal access token at https://github.com/settings/tokens with repo + read:org scopes.",
);

await runMcpServer({
  name: "github",
  version: VERSION,
  tools: TOOLS,
  client: new GitHubClient({ token }),
});
