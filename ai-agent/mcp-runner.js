import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DT_ENVIRONMENT  = process.env.DYNATRACE_CLUSTER_URL;
const DT_PLATFORM_TOKEN = process.env.DYNATRACE_API_TOKEN;

let client = null;

export async function getMcpClient() {
  if (client) return client;

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@dynatrace-oss/dynatrace-mcp-server@latest"],
    env: {
      ...process.env,
      DT_ENVIRONMENT,
      DT_PLATFORM_TOKEN,
    },
  });

  client = new Client({ name: "stadium-agent", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

export async function callTool(name, args = {}) {
  const c = await getMcpClient();
  try {
    const result = await c.callTool({ name, arguments: args });
    return { ok: true, value: result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
