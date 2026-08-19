import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(projectDir, "dist/src/server.js")],
  cwd: projectDir,
});
const client = new Client({ name: "wekan-mcp-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  for (const required of ["healthCheck", "listBoards", "createCard", "createSubtask", "commentCard", "createChecklist"]) {
    assert.ok(names.includes(required), `missing MCP tool ${required}`);
  }

  const health = await client.callTool({ name: "healthCheck", arguments: {} });
  assert.equal(health.isError, undefined);
  const boards = await client.callTool({ name: "listBoards", arguments: {} });
  assert.equal(boards.isError, undefined);

  process.stdout.write(JSON.stringify({ ok: true, toolCount: names.length, verifiedCalls: ["healthCheck", "listBoards"] }) + "\n");
} finally {
  await client.close();
}
