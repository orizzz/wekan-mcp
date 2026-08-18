import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "./config.js";
import { registerTools } from "./tools/register.js";
import { WekanClient } from "./wekan-client.js";

const server = new McpServer(
  { name: "spn-wekan-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

registerTools(server, new WekanClient(readConfig()));
await server.connect(new StdioServerTransport());
