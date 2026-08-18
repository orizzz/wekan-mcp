# Wekan MCP Server

Connect an AI assistant to a Wekan board through the [Model Context Protocol](https://modelcontextprotocol.io/). This server uses Wekan's REST API over a local stdio transport, so it can run with MCP-compatible clients such as AionUI, Claude Desktop, and MCP Inspector.

## What it provides

- Discover accessible boards, lists, swimlanes, and cards.
- Create, read, update, move, and permanently delete cards.
- Create native Wekan subtasks with a parent card.
- Add and list card comments.
- Create checklists and manage checklist items.
- Authenticate with an API token or username and password.
- Use Wekan's list-scoped card routes, including the source list required for updates and moves.
- Run an optional local Wekan and FerretDB stack with the included Docker Compose file.

## Requirements

- Node.js 20 or newer.
- A reachable Wekan instance with REST API access.
- An MCP-compatible client.
- Docker and Docker Compose, only if you want to run Wekan locally.

## Installation

```bash
git clone https://github.com/orizzz/wekan-mcp.git
cd wekan-mcp
npm install
cp .env.example .env
```

Edit `.env` with the URL and credentials for your Wekan instance. Keep `.env` private; it is excluded by `.gitignore`.

## Configuration

You can authenticate with a long-lived API token:

```dotenv
WEKAN_BASE_URL=https://wekan.example.com
WEKAN_API_TOKEN=your-api-token
```

Or use username/password authentication:

```dotenv
WEKAN_BASE_URL=https://wekan.example.com
WEKAN_USERNAME=your-username
WEKAN_PASSWORD=your-password
```

Available settings:

| Variable | Required | Description |
| --- | --- | --- |
| `WEKAN_BASE_URL` | Yes | Base URL of the Wekan instance. |
| `WEKAN_API_TOKEN` | One auth method | Wekan bearer token. |
| `WEKAN_USERNAME` | One auth method | Wekan username. |
| `WEKAN_PASSWORD` | One auth method | Wekan password. |
| `WEKAN_REQUEST_TIMEOUT_MS` | No | HTTP timeout in milliseconds. Defaults to `15000`. |

For production instances, use HTTPS and a Wekan account with only the permissions required by the assistant.

## Build and run

```bash
npm run check
npm run build
npm start
```

The MCP server communicates over stdin/stdout. Do not write diagnostic logs to stdout because that would corrupt the MCP protocol stream.

The compiled server is located at `dist/src/server.js`:

```bash
node dist/src/server.js
```

The process must start from the project directory so it can load `.env`, or the environment variables can be supplied directly by the MCP client.

## MCP client configuration

For a client that supports stdio servers, point the server to the compiled entrypoint:

```json
{
  "mcpServers": {
    "wekan": {
      "command": "node",
      "args": ["/absolute/path/to/wekan-mcp/dist/src/server.js"]
    }
  }
}
```

If the client does not let you set the working directory, provide the `WEKAN_*` variables in its stdio environment configuration or use a small launcher script that changes into the project directory first.

## Available tools

### Discovery

`healthCheck`, `listBoards`, `getBoard`, `listLists`, `listSwimlanes`, `listCards`, and `getCard`.

### Cards and subtasks

`createCard`, `createSubtask`, `updateCard`, `moveCard`, and `deleteCard`.

`updateCard` and `moveCard` require `fromListId`, the card's current list. `deleteCard` requires `confirm: true` so an assistant cannot delete a card accidentally.

### Comments and checklists

`listComments`, `commentCard`, `listChecklists`, `createChecklist`, `addChecklistItem`, and `updateChecklistItem`.

Native subtasks are stored with Wekan's `parentId` relationship. The server uses the one-card bulk endpoint for subtask creation because some Wekan releases ignore `parentId` on the standard create-card endpoint.

## Run Wekan locally

The repository includes a convenience stack using Wekan and FerretDB with named Docker volumes:

```bash
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f
```

Stop the containers without removing data:

```bash
docker compose -f docker-compose.yml down
```

Avoid `docker compose down -v` unless you intentionally want to delete the named database and file volumes.

## Testing

Run the local, non-network test suite:

```bash
npm test
```

Verify MCP stdio initialization and tool discovery:

```bash
npm run test:mcp
```

Run the live smoke test only against a disposable or development Wekan instance. It creates temporary cards, comments, checklists, and a subtask, then attempts cleanup:

```bash
npm run test:live
```

## Development notes

- Keep credentials in `.env` or the MCP client's private environment configuration.
- Discover board, list, and swimlane IDs instead of hard-coding them in an agent workflow.
- Read a card before moving it so `fromListId` is current.
- Use a checklist for small completion items and a native subtask for work that needs its own card lifecycle.
- Wekan's REST API is not complete across every release. Verify a new endpoint against the target Wekan version before adding it to an agent workflow.

## Appreciation

This project builds on the original Wekan MCP adapter created by [namar0x0309](https://github.com/namar0x0309/wekan-mcp). The original repository provided the initial MCP server structure, Wekan authentication flow, core board/list/swimlane/card tools, token setup helpers, and the foundation for connecting AI agents with Wekan.

Thank you to `namar0x0309` and the contributors to the original project for making that foundation available to the community.
