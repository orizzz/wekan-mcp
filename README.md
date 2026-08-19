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

When both a `.env` file and MCP-client environment variables are present, the
explicit process environment wins. `WEKAN_BASE_URL` must be an `http://` or
`https://` URL, and the timeout must be a positive integer.

For production instances, use HTTPS and a Wekan account with only the permissions required by the assistant.

## Local development

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

For a client that supports stdio servers, run the MCP server through Docker
Compose. The container receives its credentials from this repository's `.env`
file and reaches Wekan through the internal Compose network:

```json
{
  "mcpServers": {
    "wekan": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/absolute/path/to/wekan-mcp/docker-compose.yml",
        "--profile",
        "mcp",
        "run",
        "--rm",
        "-T",
        "wekan-mcp"
      ]
    }
  }
}
```

For local development without Docker, run `node dist/src/server.js` from the
project directory after building it.

## Available tools

### Discovery

`healthCheck`, `listBoards`, `getBoard`, `listLists`, `listSwimlanes`, `listCards`, and `getCard`.

### Cards and subtasks

`createCard`, `createSubtask`, `updateCard`, `moveCard`, and `deleteCard`.

`updateCard` and `moveCard` require `fromListId`, the card's current list. `deleteCard` requires `confirm: true` so an assistant cannot delete a card accidentally.

### Comments and checklists

`listComments`, `commentCard`, `listChecklists`, `createChecklist`, `addChecklistItem`, and `updateChecklistItem`.

Native subtasks are stored with Wekan's `parentId` relationship. The server uses the one-card bulk endpoint for subtask creation because some Wekan releases ignore `parentId` on the standard create-card endpoint.

## Run Wekan and MCP locally

The Compose stack contains exactly three services: `ferretdb`, `wekan`, and the
stdio-only `wekan-mcp` entrypoint. Start the persistent Wekan services first:

```bash
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml up -d --build wekan ferretdb
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f
```

Run the MCP entrypoint manually to inspect its stdio session, or let the MCP
client configuration above run it automatically:

```bash
docker compose -f docker-compose.yml --profile mcp run --rm -T wekan-mcp
```

Docker Compose is the lifecycle manager for all three services. No Wekan systemd
unit or `systemctl` wrapper is required; use `docker compose up`, `ps`, `logs`,
and `down` for startup, inspection, monitoring, and shutdown. Service names are
project-scoped so this stack can coexist with another Compose project.

Do not start this stack alongside an existing Wekan deployment on the same
`WEKAN_PORT`. A new Compose project creates its own named data volumes; migrate
or explicitly reuse the existing FerretDB and file volumes before replacing a
deployment that already contains board data.

The MCP image is built from this repository's `Dockerfile`; the Wekan and
FerretDB releases are pinned for reproducible local runs. Upgrade them
deliberately, then validate with `docker compose config --quiet` before
starting the stack.

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

The live smoke test is read-only by default. It authenticates and discovers
boards without changing Wekan:

```bash
npm run test:live
```

To exercise card, comment, checklist, native-subtask, and update endpoints,
explicitly opt into mutations and provide a disposable board and list. The
temporary cards are removed on completion on a best-effort basis:

```bash
WEKAN_SMOKE_MODE=mutating \
WEKAN_SMOKE_BOARD_ID=your-board-id \
WEKAN_SMOKE_LIST_ID=your-list-id \
npm run test:live
```

`WEKAN_SMOKE_USERNAME` and `WEKAN_SMOKE_BOARD_TITLE` are optional assertions.

## Development notes

- Keep credentials in `.env` or the MCP client's private environment configuration.
- Discover board, list, and swimlane IDs instead of hard-coding them in an agent workflow.
- Read a card before moving it so `fromListId` is current.
- Use a checklist for small completion items and a native subtask for work that needs its own card lifecycle.
- Wekan's REST API is not complete across every release. Verify a new endpoint against the target Wekan version before adding it to an agent workflow.

## Appreciation

This project builds on the original Wekan MCP adapter created by [namar0x0309](https://github.com/namar0x0309/wekan-mcp). The original repository provided the initial MCP server structure, Wekan authentication flow, core board/list/swimlane/card tools, token setup helpers, and the foundation for connecting AI agents with Wekan.

Thank you to `namar0x0309` and the contributors to the original project for making that foundation available to the community.
