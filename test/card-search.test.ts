import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchResult, filterCards } from "../src/card-search.js";
import type { WekanCard } from "../src/types.js";

const cards: WekanCard[] = [
  { _id: "1", title: "Deploy API", description: "Production", labelIds: ["urgent", "backend"], dueAt: "2026-08-18T00:00:00.000Z", customFields: { owner: "Oriz", points: 3 } },
  { _id: "2", title: "Write docs", labelIds: ["backend"], customFields: [{ fieldId: "owner", value: "Mira" }] },
  { _id: "3", title: "Archive", labelIds: ["urgent"], dueAt: "2026-09-01T00:00:00.000Z" },
];

test("filters labels, due dates, custom fields, and text with AND semantics", () => {
  const result = filterCards(cards, {
    labelIds: ["urgent", "backend"],
    labelMode: "all",
    due: { state: "overdue" },
    customFields: [{ fieldId: "owner", operator: "contains", value: "oriz" }],
    text: "deploy",
  }, new Date("2026-08-20T00:00:00.000Z"));
  assert.deepEqual(result.map((card) => card._id), ["1"]);
});

test("supports missing fields and stable limits", () => {
  const result = buildSearchResult(cards, {
    customFields: [{ fieldId: "owner", operator: "missing" }],
    limit: 1,
  }, ["list-1"]);
  assert.equal(result.totalMatched, 1);
  assert.equal(result.returned, 1);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.searchedListIds, ["list-1"]);
});
