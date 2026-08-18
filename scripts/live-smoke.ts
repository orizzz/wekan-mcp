import assert from "node:assert/strict";
import { readConfig } from "../src/config.js";
import { WekanClient } from "../src/wekan-client.js";

const boardId = process.env.WEKAN_SMOKE_BOARD_ID ?? "Nydgc3SwgXmTBa2et";
const listId = process.env.WEKAN_SMOKE_LIST_ID ?? "9rcSCZEbbqjx6WbGy";
const client = new WekanClient(readConfig());
const createdCardIds: string[] = [];

try {
  const user = await client.currentUser(true);
  assert.equal(user.username, "agent-manager");

  const boards = await client.listBoards();
  assert.ok(boards.some((board) => board._id === boardId && board.title === "SPN Work"));

  const parent = await client.createCard(boardId, listId, {
    title: `[MCP smoke] parent ${new Date().toISOString()}`,
    description: "Temporary card; removed automatically by live smoke test.",
  });
  createdCardIds.push(parent._id);

  const comment = await client.addComment(boardId, parent._id, "MCP smoke comment");
  assert.ok(comment._id);
  const comments = await client.listComments(boardId, parent._id);
  assert.ok(comments.some((entry) => entry._id === comment._id));

  const checklist = await client.createChecklist(boardId, parent._id, "Smoke checklist");
  assert.ok(checklist._id);
  const item = await client.addChecklistItem(boardId, parent._id, checklist._id, "Smoke item");
  assert.ok(item._id);
  await client.updateChecklistItem(boardId, parent._id, checklist._id, item._id, { isFinished: true });

  const subtask = await client.createCard(boardId, listId, {
    title: "[MCP smoke] native subtask",
    parentId: parent._id,
  });
  createdCardIds.push(subtask._id);
  const storedSubtask = await client.getCard(boardId, listId, subtask._id);
  assert.equal(storedSubtask.parentId, parent._id);

  await client.updateCard(boardId, listId, parent._id, { title: "[MCP smoke] updated parent" });
  const updatedParent = await client.getCard(boardId, listId, parent._id);
  assert.equal(updatedParent.title, "[MCP smoke] updated parent");

  process.stdout.write(JSON.stringify({
    ok: true,
    board: "SPN Work",
    verified: ["authentication", "boards", "cards", "comments", "checklists", "native subtasks", "updates"],
  }) + "\n");
} finally {
  for (const cardId of createdCardIds.reverse()) {
    try {
      await client.deleteCard(boardId, listId, cardId);
    } catch {
      // Cleanup is best effort so the original smoke-test error remains visible.
    }
  }
}
