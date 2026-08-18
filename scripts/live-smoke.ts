import assert from "node:assert/strict";
import { readConfig } from "../src/config.js";
import { WekanClient } from "../src/wekan-client.js";

type SmokeMode = "readonly" | "mutating";

function readMode(): SmokeMode {
  const mode = process.env.WEKAN_SMOKE_MODE ?? "readonly";
  if (mode !== "readonly" && mode !== "mutating") {
    throw new Error("WEKAN_SMOKE_MODE must be readonly or mutating");
  }
  return mode;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when WEKAN_SMOKE_MODE=mutating`);
  return value;
}

const mode = readMode();
const expectedUsername = process.env.WEKAN_SMOKE_USERNAME?.trim();
const client = new WekanClient(readConfig());

const user = await client.currentUser(true);
if (expectedUsername) assert.equal(user.username, expectedUsername);

const boards = await client.listBoards();
if (mode === "readonly") {
  const boardId = process.env.WEKAN_SMOKE_BOARD_ID?.trim();
  const board = boardId ? boards.find((entry) => entry._id === boardId) : undefined;
  if (boardId) assert.ok(board, `WEKAN_SMOKE_BOARD_ID ${boardId} is not accessible`);
  process.stdout.write(JSON.stringify({
    ok: true,
    mode,
    user: user.username,
    boards: board ? [{ id: board._id, title: board.title }] : boards.map((entry) => ({ id: entry._id, title: entry.title })),
    verified: ["authentication", "board discovery"],
  }) + "\n");
} else {
  const boardId = requiredEnv("WEKAN_SMOKE_BOARD_ID");
  const listId = requiredEnv("WEKAN_SMOKE_LIST_ID");
  const expectedBoardTitle = process.env.WEKAN_SMOKE_BOARD_TITLE?.trim();
  const board = boards.find((entry) => entry._id === boardId);
  assert.ok(board, `WEKAN_SMOKE_BOARD_ID ${boardId} is not accessible`);
  if (expectedBoardTitle) assert.equal(board.title, expectedBoardTitle);

  const createdCardIds: string[] = [];
  try {
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
      mode,
      board: board.title,
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
}
