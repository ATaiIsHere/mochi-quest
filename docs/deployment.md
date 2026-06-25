# Deployment

Mochi Quest is split into two deployable concerns:

- **Server**: REST API, Web UI, scheduler, SQLite storage, and MCP entrypoint.
- **Skill**: `packages/mochi-quest/SKILL.md` — agent behavior instructions; install into your agent separately.

## Server

### Docker (recommended)

```bash
docker compose up -d --build
```

Open the dashboard: http://localhost:3030

The container exposes:

- `GET /` — built React dashboard
- `GET /health` — healthcheck
- `GET /api/*` — REST API
- `node packages/server/dist/index.js mcp` — MCP stdio entrypoint

Data is stored in the `mochi_quest_data` Docker volume at `/data/data.db`.

### Local (no Docker)

```bash
pnpm install
pnpm -r build
node packages/server/dist/index.js start
```

Optional custom DB path:

```bash
MOCHI_QUEST_DB=/path/to/data.db node packages/server/dist/index.js start
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3030` | HTTP server port |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` to expose to network) |
| `MOCHI_QUEST_DB` | `~/.mochi-quest/data.db` | SQLite database path |
| `MOCHI_QUEST_WEB_DIST` | `packages/web/dist` resolved from server build output | Built Web UI directory |

Create a `.env` file in the repo root to override defaults (see `.env.example`).

## Connecting an AI agent

### Step 1 — MCP server config

The MCP server communicates over **stdio** (standard MCP). Config format differs per agent:

#### Claude Code

`~/.claude/settings.json` or project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "mochi-quest": {
      "command": "node",
      "args": ["/absolute/path/to/mochi-quest/packages/server/dist/index.js", "mcp"]
    }
  }
}
```

**Docker variant** (if running via Docker):
```json
{
  "mcpServers": {
    "mochi-quest": {
      "command": "docker",
      "args": ["compose", "-f", "/absolute/path/to/mochi-quest/compose.yaml", "exec", "-T", "mochi-quest", "node", "packages/server/dist/index.js", "mcp"]
    }
  }
}
```

#### Cursor

`.cursor/mcp.json` in your home or project directory:

```json
{
  "mcpServers": {
    "mochi-quest": {
      "command": "node",
      "args": ["/absolute/path/to/mochi-quest/packages/server/dist/index.js", "mcp"]
    }
  }
}
```

#### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "mochi-quest": {
      "command": "node",
      "args": ["/absolute/path/to/mochi-quest/packages/server/dist/index.js", "mcp"]
    }
  }
}
```

#### OpenCode

`opencode.json` in your project or home directory:

```json
{
  "mcp": {
    "mochi-quest": {
      "type": "local",
      "command": ["node", "/absolute/path/to/mochi-quest/packages/server/dist/index.js", "mcp"]
    }
  }
}
```

#### Other agents

Any agent that supports MCP stdio servers can connect using the same pattern: run `node packages/server/dist/index.js mcp` as a subprocess. Check your agent's documentation for the exact config format.

---

### Step 2 — Install the skill

Install `packages/mochi-quest/SKILL.md` into your agent's skill system.

#### Claude Code

Copy or symlink the skill directory into your skills folder:

```bash
# Symlink (stays in sync with repo updates)
ln -s /absolute/path/to/mochi-quest/packages/mochi-quest ~/.claude/skills/mochi-quest

# Or copy
cp -r packages/mochi-quest ~/.claude/skills/
```

Then invoke with `/mochi-quest` or let Claude activate it automatically when relevant.

#### Other agents

Check your agent's documentation for where to place skill directories. Most agents that support the [Agent Skills](https://agentskills.io) standard look for skills in a configured directory. The `packages/mochi-quest/` folder is a valid Agent Skills directory.

If your agent doesn't support Agent Skills yet, paste the contents of `SKILL.md` (after the frontmatter) into the agent's system prompt or project instructions.

## Non-Docker local run

```bash
pnpm install
pnpm -r build
node packages/server/dist/index.js start
```
