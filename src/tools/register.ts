import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CardSearchFilter } from "../card-search.js";
import type { WekanClient } from "../wekan-client.js";

const id = z.string().trim().min(1);
const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function cardSummary(card: Record<string, unknown>) {
  return {
    id: card._id,
    title: card.title,
    description: card.description,
    boardId: card.boardId,
    listId: card.listId,
    swimlaneId: card.swimlaneId,
    parentId: card.parentId,
    archived: card.archived,
    dueAt: card.dueAt,
    members: card.members,
    assignees: card.assignees,
    labelIds: card.labelIds,
    customFields: card.customFields,
  };
}

export function registerTools(server: McpServer, client: WekanClient): void {
  server.tool("healthCheck", "Verify Wekan authentication and report the current user", {}, async () => {
    const user = await client.currentUser(true);
    return text({ ok: true, user: { id: user._id, username: user.username } });
  });

  server.tool("listBoards", "List Wekan boards accessible to the current account", {}, async () => {
    const boards = await client.listBoards();
    return text(boards.map((board) => ({ id: board._id, title: board.title })));
  });

  server.tool("getBoard", "Get one Wekan board", { boardId: id }, async ({ boardId }) => {
    const board = await client.getBoard(boardId);
    return text({ id: board._id, title: board.title, permission: board.permission, archived: board.archived });
  });

  server.tool("listLists", "List lists in a board", { boardId: id }, async ({ boardId }) => {
    const lists = await client.listLists(boardId);
    return text(lists.map((list) => ({ id: list._id, title: list.title, archived: list.archived })));
  });

  server.tool("listSwimlanes", "List swimlanes in a board", { boardId: id }, async ({ boardId }) => {
    const lanes = await client.listSwimlanes(boardId);
    return text(lanes.map((lane) => ({ id: lane._id, title: lane.title, archived: lane.archived })));
  });

  server.tool("listCards", "List cards in one board list", { boardId: id, listId: id }, async ({ boardId, listId }) => {
    const cards = await client.listCards(boardId, listId);
    return text(cards.map((card) => cardSummary(card)));
  });

  const customFieldFilter = z.object({
    fieldId: id,
    operator: z.enum(["equals", "contains", "exists", "missing"]),
    value: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
  }).superRefine((field, context) => {
    if ((field.operator === "equals" || field.operator === "contains") && field.value === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "value is required for this operator" });
    }
    if (field.operator === "contains" && typeof field.value !== "string") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "contains requires a string value" });
    }
  });
  const dueFilter = z.object({
    state: z.enum(["set", "missing", "overdue"]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).superRefine((due, context) => {
    if (due.state && (due.from || due.to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "state cannot be combined with from or to" });
    }
    if (due.from && due.to && new Date(due.from) > new Date(due.to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "from must be before or equal to to" });
    }
  });
  server.tool("searchCards", "Search accessible cards across a board without changing Wekan", {
    boardId: id,
    listIds: z.array(id).min(1).optional(),
    includeArchivedLists: z.boolean().optional(),
    labelIds: z.array(id).min(1).optional(),
    labelMode: z.enum(["all", "any"]).optional(),
    due: dueFilter.optional(),
    customFields: z.array(customFieldFilter).optional(),
    text: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }, async ({ boardId, ...filter }) => {
    const result = await client.searchCards(boardId, filter as CardSearchFilter);
    return text({
      totalMatched: result.totalMatched,
      returned: result.returned,
      truncated: result.truncated,
      searchedListIds: result.searchedListIds,
      cards: result.cards.map((card) => cardSummary(card)),
    });
  });

  server.tool("getCard", "Get one card by board, list, and card ID", {
    boardId: id,
    listId: id,
    cardId: id,
  }, async ({ boardId, listId, cardId }) => text(await client.getCard(boardId, listId, cardId)));

  const cardFields = {
    boardId: id,
    listId: id,
    title: z.string().trim().min(1),
    description: z.string().optional(),
    swimlaneId: id.optional(),
    due: z.string().datetime().optional(),
    members: z.array(id).optional(),
    assignees: z.array(id).optional(),
    labels: z.array(id).optional(),
    parentCardId: id.optional(),
  };
  server.tool("createCard", "Create a card; parentCardId creates it as a native Wekan subtask", cardFields, async (args) => {
    const card = await client.createCard(args.boardId, args.listId, {
      title: args.title,
      ...(args.description === undefined ? {} : { description: args.description }),
      ...(args.swimlaneId === undefined ? {} : { swimlaneId: args.swimlaneId }),
      ...(args.due === undefined ? {} : { dueAt: args.due }),
      ...(args.members === undefined ? {} : { members: args.members }),
      ...(args.assignees === undefined ? {} : { assignees: args.assignees }),
      ...(args.labels === undefined ? {} : { labelIds: args.labels }),
      ...(args.parentCardId === undefined ? {} : { parentId: args.parentCardId }),
    });
    return text(cardSummary(card));
  });

  server.tool("createSubtask", "Create a native Wekan subtask inside a parent card", {
    boardId: id,
    listId: id,
    parentCardId: id,
    title: z.string().trim().min(1),
    description: z.string().optional(),
    swimlaneId: id.optional(),
  }, async (args) => {
    const card = await client.createCard(args.boardId, args.listId, {
      title: args.title,
      parentId: args.parentCardId,
      ...(args.description === undefined ? {} : { description: args.description }),
      ...(args.swimlaneId === undefined ? {} : { swimlaneId: args.swimlaneId }),
    });
    return text(cardSummary(card));
  });

  server.tool("updateCard", "Update or move a card; fromListId must be its current list", {
    boardId: id,
    fromListId: id,
    cardId: id,
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    listId: id.optional(),
    swimlaneId: id.optional(),
    due: z.string().datetime().nullable().optional(),
    members: z.array(id).optional(),
    assignees: z.array(id).optional(),
    labels: z.array(id).optional(),
    parentCardId: id.nullable().optional(),
  }, async (args) => {
    const card = await client.updateCard(args.boardId, args.fromListId, args.cardId, {
      ...(args.title === undefined ? {} : { title: args.title }),
      ...(args.description === undefined ? {} : { description: args.description }),
      ...(args.listId === undefined ? {} : { listId: args.listId }),
      ...(args.swimlaneId === undefined ? {} : { swimlaneId: args.swimlaneId }),
      ...(args.due === undefined ? {} : { dueAt: args.due }),
      ...(args.members === undefined ? {} : { members: args.members }),
      ...(args.assignees === undefined ? {} : { assignees: args.assignees }),
      ...(args.labels === undefined ? {} : { labelIds: args.labels }),
      ...(args.parentCardId === undefined ? {} : { parentId: args.parentCardId }),
    });
    return text(cardSummary(card));
  });

  server.tool("moveCard", "Move a card; compatibility alias using the current list ID", {
    boardId: id,
    cardId: id,
    fromListId: id,
    listId: id.optional(),
    swimlaneId: id.optional(),
  }, async ({ boardId, cardId, fromListId, listId, swimlaneId }) => {
    if (!listId && !swimlaneId) throw new Error("Provide listId or swimlaneId");
    return text(await client.updateCard(boardId, fromListId, cardId, {
      ...(listId ? { listId } : {}),
      ...(swimlaneId ? { swimlaneId } : {}),
    }));
  });

  server.tool("deleteCard", "Permanently delete a card; confirm must be true", {
    boardId: id,
    listId: id,
    cardId: id,
    confirm: z.literal(true),
  }, async ({ boardId, listId, cardId }) => {
    await client.deleteCard(boardId, listId, cardId);
    return text({ ok: true, deletedCardId: cardId });
  });

  server.tool("listComments", "List comments on a card", { boardId: id, cardId: id }, async ({ boardId, cardId }) =>
    text(await client.listComments(boardId, cardId)));

  server.tool("commentCard", "Add a comment to a card", {
    boardId: id,
    cardId: id,
    text: z.string().trim().min(1),
  }, async ({ boardId, cardId, text: comment }) => {
    const result = await client.addComment(boardId, cardId, comment);
    return text({ ok: true, commentId: result._id });
  });

  server.tool("listChecklists", "List checklists on a card", { boardId: id, cardId: id }, async ({ boardId, cardId }) =>
    text(await client.listChecklists(boardId, cardId)));

  server.tool("createChecklist", "Create a checklist on a card", {
    boardId: id,
    cardId: id,
    title: z.string().trim().min(1),
  }, async ({ boardId, cardId, title }) => text(await client.createChecklist(boardId, cardId, title)));

  server.tool("addChecklistItem", "Add an item to a card checklist", {
    boardId: id,
    cardId: id,
    checklistId: id,
    title: z.string().trim().min(1),
  }, async ({ boardId, cardId, checklistId, title }) =>
    text(await client.addChecklistItem(boardId, cardId, checklistId, title)));

  server.tool("updateChecklistItem", "Rename or complete a checklist item", {
    boardId: id,
    cardId: id,
    checklistId: id,
    itemId: id,
    title: z.string().trim().min(1).optional(),
    isFinished: z.boolean().optional(),
  }, async ({ boardId, cardId, checklistId, itemId, title, isFinished }) => {
    if (title === undefined && isFinished === undefined) throw new Error("Provide title or isFinished");
    return text(await client.updateChecklistItem(boardId, cardId, checklistId, itemId, {
      ...(title === undefined ? {} : { title }),
      ...(isFinished === undefined ? {} : { isFinished }),
    }));
  });
}
