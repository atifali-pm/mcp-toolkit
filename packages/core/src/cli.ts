export interface CliEnvVar {
  name: string;
  description: string;
}

export interface CliOptions {
  serverName: string;
  binName: string;
  version: string;
  env: CliEnvVar[];
}

export function handleCli(opts: CliOptions): boolean {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${opts.binName} ${opts.version}\n`);
    return true;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(formatHelp(opts));
    return true;
  }
  if (argv.includes("--init")) {
    process.stdout.write(formatInit(opts));
    return true;
  }
  return false;
}

function formatHelp(opts: CliOptions): string {
  const env = opts.env.map((e) => `  ${e.name}    ${e.description}`).join("\n");
  return `${opts.binName} ${opts.version}

MCP server for ${opts.serverName}. Communicates over stdio with an MCP client
(Claude Desktop, Cursor, the @modelcontextprotocol/inspector, etc).

Usage:
  ${opts.binName}                  Start the server on stdio
  ${opts.binName} --init           Print a claude_desktop_config.json snippet
  ${opts.binName} --version        Print version
  ${opts.binName} --help           Print this message

Required environment variables:
${env}

Optional environment variables:
  MCP_TOOLKIT_AUDIT_DRIVER    'sqlite' (default) or 'postgres'
  MCP_TOOLKIT_AUDIT_DB        Override SQLite path; set to 'off' to disable audit
  MCP_TOOLKIT_AUDIT_URL       Postgres connection URL (when driver=postgres)
`;
}

function formatInit(opts: CliOptions): string {
  const envBlock = opts.env
    .map((e) => `      "${e.name}": "<${e.description}>"`)
    .join(",\n");
  return `Add this block to your Claude Desktop config (claude_desktop_config.json
under "mcpServers"). On macOS the file lives at
~/Library/Application Support/Claude/claude_desktop_config.json. On Windows
it lives at %APPDATA%/Claude/claude_desktop_config.json.

  "${opts.serverName}": {
    "command": "npx",
    "args": ["-y", "${opts.binName}"],
    "env": {
${envBlock}
    }
  }

For Cursor, the same block goes into ~/.cursor/mcp.json under "mcpServers".

After editing, fully quit and reopen the client so it re-reads the config.
`;
}
