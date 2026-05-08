#!/usr/bin/env node
import { handleCli, requireEnv, runMcpServer } from "atif-mcp-core";
import { LinearClient } from "./linear-client.js";
import { TOOLS } from "./tools.js";

const VERSION = "0.1.0";

if (
  handleCli({
    serverName: "linear",
    binName: "atif-mcp-linear",
    version: VERSION,
    env: [
      {
        name: "LINEAR_API_KEY",
        description: "Linear personal API key",
      },
    ],
  })
) {
  process.exit(0);
}

const apiKey = requireEnv(
  "LINEAR_API_KEY",
  "Create a personal API key at https://linear.app/settings/account/security.",
);

await runMcpServer({
  name: "linear",
  version: VERSION,
  tools: TOOLS,
  client: new LinearClient({ apiKey }),
});
