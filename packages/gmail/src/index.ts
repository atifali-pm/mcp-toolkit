#!/usr/bin/env node
import { createLogger, handleCli, optionalEnv, requireEnv, runMcpServer } from "atif-mcp-core";
import { runConsentFlow } from "./consent.js";
import { GmailClient, defaultTokensPath } from "./gmail-client.js";
import { TOOLS } from "./tools.js";

const VERSION = "0.1.0";
const DEFAULT_PORT = 53682;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

if (
  handleCli({
    serverName: "gmail",
    binName: "atif-mcp-gmail",
    version: VERSION,
    env: [
      {
        name: "GOOGLE_OAUTH_CLIENT_ID",
        description: "Google Cloud OAuth Desktop client ID",
      },
      {
        name: "GOOGLE_OAUTH_CLIENT_SECRET",
        description: "Google Cloud OAuth Desktop client secret",
      },
    ],
  })
) {
  process.exit(0);
}

const logger = createLogger({ server: "gmail" });

const clientId = requireEnv(
  "GOOGLE_OAUTH_CLIENT_ID",
  "Create a Desktop OAuth client in Google Cloud Console and set this to its client_id.",
);
const clientSecret = requireEnv(
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "Set this to the OAuth Desktop client secret from Google Cloud Console.",
);

const port = Number.parseInt(optionalEnv("MCP_TOOLKIT_GMAIL_PORT") ?? `${DEFAULT_PORT}`, 10);
const tokensPath = optionalEnv("MCP_TOOLKIT_GMAIL_TOKENS") ?? defaultTokensPath();

const client = new GmailClient({
  clientId,
  clientSecret,
  redirectUri: `http://localhost:${port}/callback`,
  tokensPath,
});

if (!client.hasCredentials()) {
  await runConsentFlow(client, { port, scopes: SCOPES, logger });
}

await runMcpServer({
  name: "gmail",
  version: VERSION,
  tools: TOOLS,
  client,
  logger,
});
