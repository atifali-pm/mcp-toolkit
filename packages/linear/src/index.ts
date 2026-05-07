#!/usr/bin/env node
import { requireEnv, runMcpServer } from "@mcp-toolkit/core";
import { LinearClient } from "./linear-client.js";
import { TOOLS } from "./tools.js";

const apiKey = requireEnv(
  "LINEAR_API_KEY",
  "Create a personal API key at https://linear.app/settings/account/security.",
);

await runMcpServer({
  name: "linear",
  version: "0.0.1",
  tools: TOOLS,
  client: new LinearClient({ apiKey }),
});
