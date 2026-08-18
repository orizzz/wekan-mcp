# SPN Work Wekan MCP — Agent Handoff

## Runtime

- Project: `/home/oriz/Documents/wekan-mcp`
- Launcher: `/home/oriz/Documents/wekan-mcp/bin/wekan-mcp`
- Wekan UI: `http://localhost:3000`
- Board name: `SPN Work`
- Credentials are stored only in `.env` (mode `0600`); never print them in chat or logs.

## Agent workflow

1. Call `healthCheck`.
2. Call `listBoards` and select `SPN Work`; do not rely permanently on saved IDs.
3. Discover lists and swimlanes before card writes.
4. Use `createSubtask` for a native child card, or checklist tools for small completion steps.
5. Read the card before updating or moving it so `fromListId` is current.
6. Require explicit user intent before calling `deleteCard` with `confirm: true`.

## Validation

```bash
PATH=/home/oriz/.nvm/versions/node/v22.22.2/bin:$PATH npm run check
PATH=/home/oriz/.nvm/versions/node/v22.22.2/bin:$PATH npm test
PATH=/home/oriz/.nvm/versions/node/v22.22.2/bin:$PATH npm run build
```

The previous community adapter is preserved at `/home/oriz/Documents/wekan-mcp-legacy-20260818` for rollback/reference.
