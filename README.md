# Mochi Quest 🍡

> An open-source, AI-powered personal growth coaching system.

Mochi Quest lets you describe your goals — lose weight, learn English, become a Googler — and an AI coach builds a personalized plan, assigns daily tasks, tracks your progress, and dynamically adjusts when things get too hard or too easy.

**Agent-agnostic**: works with Claude, GPT, Gemini, or any MCP-capable AI agent.

---

## Features

- **Goal clarification** — AI interviews you to understand your situation, constraints, and current level before building a plan
- **Cycle-based planning** — AI plans a full cycle (7–14 days) with a per-day task menu; daily allocation runs instantly from the DB (no LLM latency)
- **Dynamic replan** — triggers automatically at cycle end, when skip rate is high, or when all optional tasks are done (too easy)
- **Multi-goal balance** — set a weight per goal; daily tasks are allocated proportionally within your daily limit
- **Coin + reward system** — earn coins from tasks, redeem for self-defined rewards; AI adjusts pricing if a reward conflicts with your goals
- **Streak tracking** — per-goal streaks + global streak (all goals done = global +1); milestone bonuses at 7/30/100/365 days
- **Web dashboard** — local UI for checking off tasks, viewing plan roadmap, wallet, and streaks
- **Real-time updates** — SSE pushes events to the UI instantly
- **Background daemon** — `node-cron` daily check at 4am (configurable): streak update, task allocation, cycle-end detection, replan flagging
- **Push notifications** — server POSTs typed events to the agent's webhook URL (pre-filtered); agent uses Discord to ask the user questions or report results

---

## Architecture

```
┌──────────────────────────────────────────┐
│               AI Agent Layer              │
│   Claude / GPT / Gemini / any MCP agent  │
│   ┌──────────────────────────────────┐   │
│   │          SKILL.md                │   │
│   │  coaching behavior & decisions   │   │
│   └──────────────────────────────────┘   │
└──────────────────┬───────────────────────┘
                   │ MCP (stdio)
┌──────────────────▼───────────────────────┐
│         MCP Server  (Node.js)            │
│  Goals · Plans · Tasks · Wallet · Streaks│
│  ┌─────────────────────────────────────┐ │
│  │    SQLite  (~/.mochi-quest/data.db) │ │
│  └─────────────────────────────────────┘ │
│  REST API :3030  ←──── Web UI (React)    │
│  node-cron (4am daily check, daemon)     │
└──────────────────────────────────────────┘
```

One command (`mochi-quest start`) runs the MCP server, REST API, and scheduler together.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- An MCP-capable AI agent (Claude Code, Cursor, etc.)

### Install

```bash
git clone https://github.com/YOUR_USERNAME/mochi-quest.git
cd mochi-quest
pnpm install
```

### Build

```bash
# Build server
cd packages/server && pnpm build

# Build web UI
cd packages/web && pnpm build
```

### Run

```bash
# Start everything (MCP + REST API + scheduler + built Web UI)
node packages/server/dist/index.js start

# Or as a background daemon
node packages/server/dist/index.js start --daemon
```

The web dashboard is available at **http://localhost:3030**.

### Docker

```bash
docker compose up -d --build
```

The Docker server stores SQLite data in the `mochi_quest_data` volume and serves the built Web UI, REST API, scheduler, and MCP entrypoint from one container.

Full deployment notes: [`docs/deployment.md`](docs/deployment.md).

### Connect to your AI agent

Add the MCP server to your agent's config:

**Claude Code** (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "mochi-quest": {
      "command": "node",
      "args": ["/path/to/mochi-quest/packages/server/dist/index.js", "mcp"]
    }
  }
}
```

Then install `skills/mochi-quest/` as a skill (or paste the SKILL.md body into your system prompt).

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `mq_get_dashboard` | Full overview: goals, today's tasks, wallet, streaks, replan status |
| `mq_list_goals` / `mq_create_goal` / `mq_update_goal` | Goal management |
| `mq_get_plan` / `mq_generate_plan` / `mq_adjust_plan` | Plan management |
| `mq_get_today_tasks` / `mq_get_optional_tasks` | Fetch tasks |
| `mq_complete_task` / `mq_skip_task` | Report task status |
| `mq_get_wallet` / `mq_list_rewards` / `mq_redeem_reward` | Coin & reward system |
| `mq_add_assessment` / `mq_get_user_state` | Track progress assessments |
| `mq_get_streak` / `mq_get_streak_milestones` | Streak info |
| `mq_get_replan_status` | Check if AI action is needed (offline catch-up) |
| `mq_send_notification` | Send a message to configured Discord channel |
| `mq_register_webhook` | Register agent webhook URL for push events |
| `mq_get_settings` / `mq_update_settings` | Global settings |

Full tool reference: [`packages/skill/SKILL.md`](packages/skill/SKILL.md)

---

## Project Structure

```
mochi-quest/
├── packages/
│   ├── server/          # MCP Server + REST API (Node.js + TypeScript)
│   │   └── src/
│   │       ├── db/      # SQLite schema & queries
│   │       ├── mcp/     # MCP tool implementations
│   │       ├── api/     # REST API routes (Hono)
│   │       └── scheduler.ts  # node-cron daily check + notifications
│   ├── web/             # Web dashboard (React + Vite + Tailwind)
│   │   └── src/
│   │       ├── pages/   # Dashboard, Goals, Tasks, Wallet, Settings
│   │       ├── components/
│   │       ├── hooks/   # useSSE for real-time updates
│   │       └── lib/     # API client + types
│   └── skill/
│       └── SKILL.md     # AI coaching behavior definition
└── docs/
    └── spec.md          # Full system specification
```

---

## How It Works

### Planning vs Execution

The AI generates a **cycle-based plan** (7–14 days) during planning sessions — a day-by-day schedule where each day has specific tasks, plus an optional pool for the whole cycle. The server allocates daily tasks by `day_in_cycle` with no LLM call, so the UI loads instantly.

### Event-driven Replan

Every meaningful state change emits a typed event through a unified pipeline:

```
emitEvent(type, data)
  ├── writeLog()           → DB audit log
  ├── emitSseEvent()       → Web UI badge (real-time)
  └── notifyAgentWebhook() → Agent HTTP endpoint (pre-filtered)
```

The server pre-filters before pushing — the agent only receives actionable signals:

| Event | Pushed to agent when… | Agent action |
|-------|----------------------|-------------|
| `task_completed` | `optional_completion_rate === 1.0` | Ask user: plan too easy? Consider replan |
| `cycle_ended` | always | Replan immediately, notify user |
| `daily_check_ran` | any goal `skip_rate_3d > 0.5` | Ask user why; decide whether to replan |
| `assessment_recorded` | always | Review plan; replan if significantly changed |

The agent registers its webhook URL via `mq_register_webhook` or the settings page. As offline catch-up, `mq_get_replan_status()` at session start returns any pending replans from while the webhook was offline.

### Multi-goal Task Allocation

Each goal has a `daily_task_weight` (1–5). Tasks are allocated proportionally:

```
weights = [3, 2, 1]  →  budget = 6  →  tasks = [3, 2, 1]
```

Adjust weights any time: "Focus more on English this week."

---

## Data Storage

All data is stored locally in `~/.mochi-quest/data.db` (SQLite). No cloud sync, no accounts.

---

## Notifications (Daemon Mode)

```bash
node packages/server/dist/index.js start --daemon
```

The built-in scheduler runs a daily check at the configured notification time (default: 08:00) and sends a native OS notification when there are pending tasks.

- macOS: Notification Center
- Windows: Toast Notification
- Linux: libnotify (`notify-send`)

---

## Roadmap

- [ ] Integration adapters (Fitbit, Garmin, Duolingo, LeetCode)
- [ ] Habitica sync (push tasks to Habitica, webhook completion back)
- [ ] Server-driven replan (server calls LLM directly in daemon mode)
- [ ] Apple Health companion app
- [ ] Auto-start installer (`mochi-quest setup`)

---

## Contributing

Pull requests welcome. Please open an issue first to discuss larger changes.

---

## License

MIT
