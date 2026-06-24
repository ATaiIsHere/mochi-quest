# Deployment

Mochi Quest is split into two deployable concerns:

- **Server**: REST API, Web UI, scheduler, SQLite storage, and MCP entrypoint.
- **Skill**: agent behavior instructions in `packages/skill/SKILL.md`; install or reference this from the agent that will operate Mochi Quest.

## Docker server

Build and start the server:

```bash
docker compose up -d --build
```

Open the dashboard:

```text
http://localhost:3030
```

The container exposes:

- `GET /` — built React dashboard
- `GET /health` — healthcheck
- `GET /api/*` — REST API
- `node packages/server/dist/index.js mcp` — MCP stdio entrypoint

Data is stored in the `mochi_quest_data` Docker volume at `/data/data.db`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `MOCHI_QUEST_PORT` | `3030` | HTTP server port |
| `MOCHI_QUEST_DB` | `~/.mochi-quest/data.db` outside Docker, `/data/data.db` in Docker | SQLite database path |
| `MOCHI_QUEST_DATA_DIR` | `~/.mochi-quest` | Directory used when `MOCHI_QUEST_DB` is unset |
| `MOCHI_QUEST_WEB_DIST` | `packages/web/dist` resolved from server build output | Built Web UI directory |

## MCP from Docker

For agents that can run shell commands, point the MCP server at the running container:

```json
{
  "mcpServers": {
    "mochi-quest": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/absolute/path/to/mochi-quest/compose.yaml",
        "exec",
        "-T",
        "mochi-quest",
        "node",
        "packages/server/dist/index.js",
        "mcp"
      ]
    }
  }
}
```

This MCP process shares the same `/data/data.db` as the dashboard/API.

## Skill installation

`packages/skill/SKILL.md` is not baked into the agent automatically. Install it into your agent's skill system or paste/reference it in that agent's system prompt.

For Claude Code, keep the MCP config above and add the skill content from:

```text
packages/skill/SKILL.md
```

## Non-Docker local run

```bash
pnpm install
pnpm -r build
node packages/server/dist/index.js start
```

Optional custom DB path:

```bash
MOCHI_QUEST_DB=/path/to/data.db node packages/server/dist/index.js start
```
