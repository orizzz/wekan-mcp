import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../src/tools/register.js";
import type { WekanClient } from "../src/wekan-client.js";

function fakeClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const card = {
    _id: "card-id",
    title: "Created card",
    description: "description",
    boardId: "board-id",
    listId: "list-id",
    swimlaneId: "swimlane-id",
    parentId: "parent-id",
  };
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };
  const client = {
    currentUser: async () => ({ _id: "user-id", username: "agent" }),
    listBoards: async () => [{ _id: "board-id", title: "Board" }],
    getBoard: async () => ({ _id: "board-id", title: "Board", permission: "private", archived: false }),
    listLists: async () => [{ _id: "list-id", title: "BACKLOG", archived: false }],
    listSwimlanes: async () => [{ _id: "swimlane-id", title: "Default", archived: false }],
    listCards: async () => [card],
    getCard: async () => card,
    createCard: async (...args: unknown[]) => {
      record("createCard", ...args);
      return card;
    },
    updateCard: async (...args: unknown[]) => {
      record("updateCard", ...args);
      return card;
    },
    deleteCard: async (...args: unknown[]) => {
      record("deleteCard", ...args);
      return { ok: true };
    },
    listComments: async () => [],
    addComment: async (...args: unknown[]) => {
      record("addComment", ...args);
      return { _id: "comment-id" };
    },
    listChecklists: async () => [],
    createChecklist: async (...args: unknown[]) => {
      record("createChecklist", ...args);
      return { _id: "checklist-id", title: "Checklist" };
    },
    addChecklistItem: async (...args: unknown[]) => {
      record("addChecklistItem", ...args);
      return { _id: "item-id" };
    },
    updateChecklistItem: async (...args: unknown[]) => {
      record("updateChecklistItem", ...args);
      return { _id: "item-id" };
    },
  } as unknown as WekanClient;
  return { client, calls };
}

async function connectedTools() {
  const server = new McpServer({ name: "tool-contract-test", version: "1.0.0" });
  const client = new Client({ name: "tool-contract-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const fake = fakeClient();
  registerTools(server, fake.client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client, fake };
}

test("registers the complete stable tool inventory", async () => {
  const { server, client } = await connectedTools();
  try {
    const result = await client.listTools();
    assert.deepEqual(result.tools.map((tool) => tool.name), [
      "healthCheck",
      "listBoards",
      "getBoard",
      "listLists",
      "listSwimlanes",
      "listCards",
      "getCard",
      "createCard",
      "createSubtask",
      "updateCard",
      "moveCard",
      "deleteCard",
      "listComments",
      "commentCard",
      "listChecklists",
      "createChecklist",
      "addChecklistItem",
      "updateChecklistItem",
    ]);
  } finally {
    await client.close();
    await server.close();
  }
});

test("maps card and subtask arguments to the client contract", async () => {
  const { server, client, fake } = await connectedTools();
  try {
    const card = await client.callTool({
      name: "createCard",
      arguments: {
        boardId: "board-id",
        listId: "list-id",
        title: "New card",
        description: "Details",
        due: "2026-08-20T12:00:00.000Z",
        labels: ["label-id"],
      },
    });
    assert.equal(card.isError, undefined);
    assert.deepEqual(fake.calls[0], {
      method: "createCard",
      args: ["board-id", "list-id", {
        title: "New card",
        description: "Details",
        dueAt: "2026-08-20T12:00:00.000Z",
        labelIds: ["label-id"],
      }],
    });

    await client.callTool({
      name: "createSubtask",
      arguments: { boardId: "board-id", listId: "list-id", parentCardId: "parent-id", title: "Subtask" },
    });
    assert.deepEqual(fake.calls[1], {
      method: "createCard",
      args: ["board-id", "list-id", { title: "Subtask", parentId: "parent-id" }],
    });
  } finally {
    await client.close();
    await server.close();
  }
});

test("enforces validation and destructive-operation confirmation", async () => {
  const { server, client, fake } = await connectedTools();
  try {
    const invalidCreate = await client.callTool({
      name: "createCard",
      arguments: { boardId: "board-id", listId: "list-id", title: "   " },
    });
    assert.equal(invalidCreate.isError, true);
    assert.equal(fake.calls.length, 0);

    const missingConfirmation = await client.callTool({
      name: "deleteCard",
      arguments: { boardId: "board-id", listId: "list-id", cardId: "card-id", confirm: false },
    });
    assert.equal(missingConfirmation.isError, true);
    assert.equal(fake.calls.length, 0);

    const missingMoveTarget = await client.callTool({
      name: "moveCard",
      arguments: { boardId: "board-id", fromListId: "list-id", cardId: "card-id" },
    });
    assert.equal(missingMoveTarget.isError, true);
    assert.equal(fake.calls.length, 0);

    const missingChecklistUpdate = await client.callTool({
      name: "updateChecklistItem",
      arguments: { boardId: "board-id", cardId: "card-id", checklistId: "checklist-id", itemId: "item-id" },
    });
    assert.equal(missingChecklistUpdate.isError, true);
    assert.equal(fake.calls.length, 0);
  } finally {
    await client.close();
    await server.close();
  }
});

test("returns stable JSON text for successful tool responses", async () => {
  const { server, client } = await connectedTools();
  try {
    const result = await client.callTool({ name: "healthCheck", arguments: {} });
    assert.equal(result.isError, undefined);
    const content = result.content as Array<{ type: string; text?: string }>;
    assert.deepEqual(JSON.parse(String(content[0]?.type === "text" ? content[0].text : "")), {
      ok: true,
      user: { id: "user-id", username: "agent" },
    });
  } finally {
    await client.close();
    await server.close();
  }
});
