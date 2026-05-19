import { createServer } from "node:http";
import type { Logger } from "atif-mcp-core";
import type { GmailClient } from "./gmail-client.js";

export interface ConsentOptions {
  port: number;
  scopes: string[];
  logger: Logger;
}

export async function runConsentFlow(
  client: GmailClient,
  opts: ConsentOptions,
): Promise<void> {
  const authUrl = client.generateAuthUrl(opts.scopes);
  process.stderr.write(`\n${"=".repeat(72)}\n`);
  process.stderr.write("Gmail MCP server: first-run consent flow\n");
  process.stderr.write(`${"=".repeat(72)}\n`);
  process.stderr.write(
    `Open this URL in a browser, sign in to the Gmail account you want the\n` +
      `server to act on behalf of, and click Allow:\n\n${authUrl}\n\n` +
      `Listening for the redirect on http://localhost:${opts.port}/callback ...\n`,
  );

  const code = await waitForCode(opts.port, opts.logger);
  await client.exchangeCode(code);
  process.stderr.write(
    `Refresh token captured and saved. The server will now start; rerun without\n` +
      `closing this window the next time and consent will be skipped.\n${"=".repeat(72)}\n\n`,
  );
}

function waitForCode(port: number, logger: Logger): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("missing url");
        return;
      }
      const u = new URL(req.url, `http://localhost:${port}`);
      if (u.pathname !== "/callback") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const code = u.searchParams.get("code");
      const error = u.searchParams.get("error");
      if (error) {
        res.statusCode = 400;
        res.end(`OAuth error: ${error}. You can close this tab.`);
        server.close();
        reject(new Error(`OAuth consent failed: ${error}`));
        return;
      }
      if (!code) {
        res.statusCode = 400;
        res.end("missing code in callback");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<html><body style='font-family:sans-serif;padding:48px;'>" +
          "<h2>Gmail MCP server connected.</h2>" +
          "<p>You can close this tab and return to the terminal.</p>" +
          "</body></html>",
      );
      server.close();
      resolve(code);
    });
    server.on("error", (err) => {
      logger.error("consent server failed", { error: err.message });
      reject(err);
    });
    server.listen(port, "127.0.0.1");
  });
}
