# SPN Wekan MCP

Local stdio MCP server for the Wekan instance at `http://localhost:3000`, with the SPN board named **SPN Work**.

## Requirements

- Node.js 20 or newer
- A reachable Wekan instance
- `.env` containing `WEKAN_BASE_URL` and either an API token or username/password

## Setup

```bash
cp .env.example .env
npm install
npm run build
npm test
./bin/wekan-mcp
```

Run `npm run test:live` only against the local SPN Work board. It creates temporary cards and removes them in a `finally` cleanup.
Run `npm run test:mcp` to verify stdio initialization, tool discovery, authentication, and a board read through the real launcher.

The launcher uses the local Node 22 binary and changes into this directory before starting, so `.env` is loaded consistently from AionUI.

## Wekan stack

The local Wekan and FerretDB stack is defined in [`docker-compose.yml`](./docker-compose.yml):

```bash
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f
```

The stack uses named Docker volumes for Wekan data. Do not run `docker compose down -v` unless you intentionally want to remove that data.

## Tools

- Discovery: `healthCheck`, `listBoards`, `getBoard`, `listLists`, `listSwimlanes`, `listCards`, `getCard`
- Cards: `createCard`, `createSubtask`, `updateCard`, `moveCard`, `deleteCard`
- Comments: `listComments`, `commentCard`
- Checklists: `listChecklists`, `createChecklist`, `addChecklistItem`, `updateChecklistItem`

`deleteCard` requires `confirm: true`. `updateCard` and `moveCard` require the card's current list as `fromListId`, matching Wekan's REST route.

## Native subtasks

Use `createSubtask` with the parent card ID. Wekan stores the new card with `parentId`, so it appears in the parent card's native subtask section rather than as a checklist item. This server uses Wekan's one-card bulk route for subtasks because the running build's normal create-card route does not persist `parentId` from its request body.

## Current SPN Work IDs

- Board: `Nydgc3SwgXmTBa2et`
- Default swimlane: `qrpAQSEdtkYv9zKSP`

IDs should still be rediscovered with list tools when boards are recreated.
