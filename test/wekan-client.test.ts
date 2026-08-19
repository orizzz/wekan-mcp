import assert from "node:assert/strict";
import test from "node:test";
import type { WekanConfig } from "../src/config.js";
import { WekanApiError, WekanClient, type WekanHttpResponse, type WekanRequestOptions, type WekanTransport } from "../src/wekan-client.js";

const config: WekanConfig = {
  baseUrl: "https://wekan.example.test",
  token: "api-token",
  username: undefined,
  password: undefined,
  timeoutMs: 1_000,
};

function response(statusCode: number, payload: unknown): WekanHttpResponse {
  return {
    statusCode,
    body: {
      text: async () => payload === undefined ? "" : typeof payload === "string" ? payload : JSON.stringify(payload),
    },
  };
}

function queuedTransport(
  queued: Array<WekanHttpResponse | Error>,
): { transport: WekanTransport; calls: Array<{ url: string; options: WekanRequestOptions }> } {
  const calls: Array<{ url: string; options: WekanRequestOptions }> = [];
  const transport: WekanTransport = async (url, options) => {
    calls.push({ url, options });
    const next = queued.shift();
    if (!next) throw new Error("No queued response");
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, calls };
}

test("uses the configured API token and encodes resource IDs", async () => {
  const { transport, calls } = queuedTransport([response(200, { _id: "board-id", title: "Board" })]);
  const board = await new WekanClient(config, transport).getBoard("board/with spaces");

  assert.equal(board.title, "Board");
  assert.equal(calls[0]?.url, "https://wekan.example.test/api/boards/board%2Fwith%20spaces");
  assert.equal(calls[0]?.options.headers.authorization, "Bearer api-token");
  assert.equal(calls[0]?.options.headers.accept, "application/json");
});

test("logs in once and caches the current user", async () => {
  const { transport, calls } = queuedTransport([
    response(200, { token: "session-token", tokenExpires: new Date(Date.now() + 300_000).toISOString() }),
    response(200, { _id: "user-id", username: "agent", boards: [] }),
  ]);
  const client = new WekanClient({
    ...config,
    token: undefined,
    username: "agent",
    password: "secret",
  }, transport);

  const first = await client.currentUser();
  const second = await client.currentUser();

  assert.equal(first.username, "agent");
  assert.equal(second, first);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "https://wekan.example.test/users/login");
  assert.match(calls[1]?.options.headers.authorization ?? "", /session-token/);
});

test("re-authenticates exactly once after a credential-based 401", async () => {
  const { transport, calls } = queuedTransport([
    response(200, { token: "old-token" }),
    response(401, { error: "expired" }),
    response(200, { token: "new-token" }),
    response(200, { _id: "user-id", username: "agent", boards: [] }),
  ]);
  const client = new WekanClient({
    ...config,
    token: undefined,
    username: "agent",
    password: "secret",
  }, transport);

  const user = await client.currentUser();

  assert.equal(user._id, "user-id");
  assert.deepEqual(calls.map((call) => call.url), [
    "https://wekan.example.test/users/login",
    "https://wekan.example.test/api/user",
    "https://wekan.example.test/users/login",
    "https://wekan.example.test/api/user",
  ]);
  assert.match(calls[3]?.options.headers.authorization ?? "", /new-token/);
});

test("does not retry a 401 when using a fixed API token", async () => {
  const { transport, calls } = queuedTransport([response(401, { error: "denied" })]);
  const client = new WekanClient(config, transport);

  await assert.rejects(
    () => client.getBoard("board-id"),
    (error: unknown) => error instanceof WekanApiError && error.status === 401 && error.path === "/api/boards/board-id",
  );
  assert.equal(calls.length, 1);
});

test("includes upstream error details without requiring JSON", async () => {
  const { transport } = queuedTransport([response(503, "service unavailable")]);
  const client = new WekanClient(config, transport);

  await assert.rejects(
    () => client.listLists("board-id"),
    (error: unknown) => error instanceof WekanApiError
      && error.message === "GET /api/boards/board-id/lists failed: HTTP 503",
  );
});

test("searches non-archived board lists and applies read-only filters", async () => {
  const { transport, calls } = queuedTransport([
    response(200, [
      { _id: "list-1", title: "BACKLOG", archived: false },
      { _id: "list-2", title: "DONE", archived: true },
    ]),
    response(200, [{ _id: "card-1", title: "Deploy", labelIds: ["urgent"], listId: "list-1" }]),
  ]);
  const result = await new WekanClient(config, transport).searchCards("board-id", { labelIds: ["urgent"] });

  assert.equal(result.totalMatched, 1);
  assert.deepEqual(result.searchedListIds, ["list-1"]);
  assert.deepEqual(result.cards.map((card) => card._id), ["card-1"]);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://wekan.example.test/api/boards/board-id/lists",
    "https://wekan.example.test/api/boards/board-id/lists/list-1/cards",
  ]);
});

test("creates regular cards with the current user's author ID", async () => {
  const { transport, calls } = queuedTransport([
    response(200, { _id: "user-id", username: "agent" }),
    response(201, { _id: "card-id", title: "New card" }),
  ]);
  const card = await new WekanClient(config, transport).createCard("board-id", "list-id", {
    title: "New card",
    swimlaneId: "lane-id",
  });

  assert.equal(card._id, "card-id");
  assert.deepEqual(JSON.parse(calls[1]?.options.body ?? "{}"), {
    title: "New card",
    swimlaneId: "lane-id",
    authorId: "user-id",
  });
});

test("uses the bulk endpoint for native subtasks and validates its response", async () => {
  const { transport, calls } = queuedTransport([
    response(200, { _id: "user-id", username: "agent" }),
    response(200, [{ _id: "subtask-id", index: 0 }]),
  ]);
  const card = await new WekanClient(config, transport).createCard("board-id", "list-id", {
    title: "Subtask",
    parentId: "parent-id",
    swimlaneId: "lane-id",
  });

  assert.equal(card.parentId, "parent-id");
  assert.equal(calls[1]?.url, "https://wekan.example.test/api/boards/board-id/lists/list-id/cards/bulk");
  assert.deepEqual(JSON.parse(calls[1]?.options.body ?? "{}"), {
    cards: [{ title: "Subtask", parentId: "parent-id", swimlaneId: "lane-id" }],
  });
});
