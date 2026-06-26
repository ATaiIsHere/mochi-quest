# Mochi Quest — System Specification

> Version: 0.2.0  
> Status: Draft  
> Last Updated: 2026-06-26

## Overview

Mochi Quest is an open-source, AI-powered personal growth coaching system. Users describe their goals, and the AI creates personalized plans, assigns daily tasks, tracks progress, and dynamically adjusts plans based on the user's evolving state.

**Key principles:**
- **Agent-agnostic**: Works with any AI agent that supports MCP (Claude, GPT, Gemini, etc.)
- **AI plans freely**: No rigid domain templates. AI reasons from first principles based on each user's specific situation.
- **Separation of concerns**: LLM handles planning; rule engine handles daily execution (no LLM latency on daily task retrieval).
- **Local-first**: Data stays on the user's machine (SQLite). No cloud required.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   AI Agent Layer                     │
│   (Claude / GPT / Gemini / any MCP-capable agent)   │
│   ┌─────────────────────────────────────────────┐   │
│   │              SKILL.md                        │   │
│   │  Defines coaching behavior, dialogue flows   │   │
│   └─────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────┘
                        │ MCP Protocol (stdio)
┌───────────────────────▼─────────────────────────────┐
│              mochi-quest Server (Node.js)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │  Goals   │ │  Plans   │ │  Tasks   │ │Wallet  │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │             SQLite (local persistence)          │  │
│  └────────────────────┬───────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐ │
│  │  REST API (:3030)  ←── Web UI data access       │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Scheduler (node-cron) — daily-check + notify   │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Integration Adapters (optional)                │ │
│  │  Fitbit / Garmin / Duolingo / Habitica / ...   │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP REST
┌───────────────────────▼─────────────────────────────┐
│              Web UI (localhost:3030)                  │
│   Dashboard · Goals · Plan · Tasks · Wallet          │
│   (React + Vite, served as static files)             │
└─────────────────────────────────────────────────────┘
```

**One command to start everything:**
```bash
npx mochi-quest start        # foreground (dev/debug)
npx mochi-quest start --daemon  # background daemon (production use)
npx mochi-quest setup        # install auto-start on login
```

---

## Data Models

### Goal

```typescript
interface Goal {
  id: string;                    // UUID
  title: string;
  category: string;              // free-form tag, e.g. "Health", "Language", "Career"
  definition: string;            // clarified goal definition from onboarding conversation
  success_criteria: string;      // measurable success definition
  deadline: string;              // ISO date, estimated if not provided by user
  lifestyle_context: {           // JSON, filled during onboarding
    available_time_per_day: string;
    constraints: string[];
    available_tools: string[];
    preferences: string[];
  };
  daily_task_weight: number;     // 1-5, for multi-goal task balancing (default: 3)
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}
```

### Plan

```typescript
interface Plan {
  id: string;                    // UUID
  goal_id: string;
  version: number;               // increments on each replan
  is_active: boolean;            // only one plan per goal is active
  milestones: Milestone[];
  current_phase: string;         // e.g. "Foundation", "Intermediate", "Advanced"
  task_template_pool: TaskTemplate[];  // LLM-generated task templates for upcoming days
  replan_pending: boolean;       // true while replan is in progress
  created_reason: 'initial' | 'high_skip_rate' | 'low_challenge' | 'user_request' | 'assessment_change' | 'task_pool_depleted';
  created_at: string;
}

interface Milestone {
  title: string;
  description: string;
  target_date: string;
  success_criteria: string;
  is_completed: boolean;
  completed_at?: string;
}

interface TaskTemplate {
  title: string;
  description: string;
  instructions: string;
  task_type: 'daily' | 'optional';
  difficulty: number;            // 1-10 relative to user's current level
  estimated_duration: string;    // e.g. "30 minutes"
  coin_reward: number;
  completion_criteria: string;
  completion_method: 'manual' | 'auto';
  tags: string[];                // for variety enforcement (no same tag consecutive days)
}
```

### Task

```typescript
interface Task {
  id: string;                    // UUID
  plan_id: string;
  goal_id: string;
  title: string;
  description: string;
  instructions: string;
  task_type: 'daily' | 'optional';
  difficulty: number;            // 1-10
  estimated_duration: string;
  due_date?: string;             // daily tasks have a due date; optional tasks don't
  coin_reward: number;
  completion_criteria: string;
  completion_method: 'manual' | 'auto';
  tags: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  notes?: string;                // user or AI notes on completion/skip
  created_at: string;
  completed_at?: string;
}
```

### Assessment

```typescript
interface Assessment {
  id: string;
  goal_id: string;
  assessment_type: string;       // free-form, e.g. "toeic_mock", "weight_kg", "leetcode_easy_rate"
  result: Record<string, unknown>;  // JSON, format varies by type
  source: 'user_report' | 'integration' | 'ai_inference';
  notes?: string;
  timestamp: string;
}
```

### UserState

```typescript
interface UserState {
  goal_id: string;
  current_level_description: string;  // natural language + quantified metrics
  strengths: string[];
  weaknesses: string[];
  integration_configs: Record<string, IntegrationConfig>;
  last_assessment_date?: string;
  updated_at: string;
}

interface IntegrationConfig {
  enabled: boolean;
  credentials?: Record<string, string>;  // stored encrypted
  last_sync?: string;
}
```

### UserWallet

```typescript
interface UserWallet {
  total_coins: number;           // lifetime earned
  available_coins: number;       // spendable balance
  updated_at: string;
}

interface WalletTransaction {
  id: string;
  type: 'earned' | 'spent' | 'milestone_bonus';
  amount: number;
  description: string;          // e.g. "Completed: 30min English listening"
  source_id?: string;           // task_id or reward_id
  timestamp: string;
}
```

### Reward

```typescript
interface Reward {
  id: string;
  title: string;
  description?: string;
  coin_cost: number;
  category: 'food' | 'leisure' | 'purchase' | 'experience' | 'custom';
  goal_impact: {                 // AI-assessed impact on goals
    goal_id: string;
    impact_level: 'none' | 'minor' | 'significant';
    reason: string;
  }[];
  suggested_cost_multiplier?: number;  // AI may increase cost if conflicts with goals
  source: 'user_defined' | 'ai_suggested';
  status: 'active' | 'redeemed' | 'archived';
  created_at: string;
}
```

### Streak

```typescript
interface Streak {
  id: string;
  goal_id: string | null;        // null = global streak (all goals completed)
  current_streak: number;        // consecutive days completed
  longest_streak: number;
  last_completed_date: string;   // ISO date
  updated_at: string;
}

interface StreakMilestone {
  days: number;                  // 7, 30, 100, 365
  bonus_coins: number;
  achieved_at?: string;
}
```

### UserSettings

```typescript
interface UserSettings {
  daily_task_total_limit: number;  // max tasks per day across all goals (default: 5)
  notification_time: string;       // HH:MM format (default: "08:00")
  timezone: string;                // e.g. "Asia/Taipei"
  log_retention_days: number;      // auto-prune activity logs older than N days (default: 3)
  llm_provider?: {                 // for server-driven replan (Phase 4+)
    provider: 'anthropic' | 'openai' | 'custom';
    api_key: string;
    model: string;
    endpoint?: string;
  };
}
```

### ActivityLog

Immutable record of system mutations. Written on every create/update/status-change, pruned
automatically based on `UserSettings.log_retention_days`.

```typescript
interface ActivityLog {
  id: string;
  event_type:
    | 'goal_created' | 'goal_updated' | 'goal_status_changed'
    | 'task_completed' | 'task_skipped' | 'daily_allocated'
    | 'plan_created' | 'replan_triggered';
  entity_type: 'goal' | 'task' | 'plan' | 'system';
  entity_id: string | null;
  goal_id: string | null;
  title: string;        // human-readable summary (Chinese)
  reason: string;       // e.g. skip reason, new status, replan trigger cause
  metadata: Record<string, unknown>;  // e.g. { coin_reward, date, count }
  timestamp: string;
}
```

**Event sources:**

| event_type | Triggered in | Typical reason/metadata |
|---|---|---|
| `goal_created` | `createGoal()` | — |
| `goal_updated` | `updateGoal()` | — |
| `goal_status_changed` | `setGoalStatus()` | reason = new status |
| `task_completed` | `completeTask()` | metadata.coin_reward |
| `task_skipped` | `skipTask()` | reason = skip reason |
| `daily_allocated` | `allocateDailyTasks()` | metadata.date, metadata.count |
| `plan_created` | `createPlan()` | reason = created_reason |
| `replan_triggered` | `triggerReplan()` | reason = trigger cause |

---

## MCP Tools Interface

All tools are prefixed with `mq_` to avoid naming conflicts.

### Goal Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `mq_list_goals` | `status?: string` | List goals, optionally filtered by status |
| `mq_get_goal` | `id: string` | Get full goal details |
| `mq_create_goal` | `title, category, definition, success_criteria, deadline, lifestyle_context, daily_task_weight?` | Create new goal |
| `mq_update_goal` | `id, ...partial` | Update goal fields |
| `mq_complete_goal` | `id` | Mark goal as completed |
| `mq_pause_goal` | `id` | Pause goal (no tasks assigned, streak not counted) |
| `mq_resume_goal` | `id` | Resume paused goal |

### Plan Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `mq_get_plan` | `goal_id: string` | Get active plan with milestones + upcoming task preview |
| `mq_generate_plan` | `goal_id: string, plan_data: Plan` | Store AI-generated plan (AI calls this after reasoning) |
| `mq_adjust_plan` | `goal_id: string, reason: string` | Mark replan_pending = true with reason |
| `mq_get_replan_status` | `goal_id?: string` | Check if any goal has pending replan |
| `mq_get_plan_history` | `goal_id: string` | Get all plan versions for a goal |

### Task Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `mq_get_today_tasks` | — | Get today's daily tasks (allocated per multi-goal balance algorithm) |
| `mq_get_optional_tasks` | `goal_id?: string` | Get optional task pool |
| `mq_create_task` | `goal_id, plan_id, task data...` | Create a task from template (AI uses this to add to optional pool) |
| `mq_complete_task` | `id: string, notes?: string` | Mark completed, add coins, trigger checks |
| `mq_skip_task` | `id: string, reason: string` | Skip task, update streak if daily, trigger skip-rate check |
| `mq_get_task_history` | `goal_id: string, limit?: number` | Get recent task history |

### Reward System

| Tool | Parameters | Description |
|------|-----------|-------------|
| `mq_get_wallet` | — | Get balance and recent transactions |
| `mq_list_rewards` | `status?: string` | List rewards |
| `mq_create_reward` | `title, description?, category, coin_cost` | Add user-defined reward |
| `mq_redeem_reward` | `id: string` | Redeem reward (deduct coins) |
| `mq_suggest_rewards` | `preferences: string` | AI suggests rewards based on preferences |
| `mq_review_reward_pricing` | `reward_id: string` | AI audits reward pricing vs. goal conflicts |
| `mq_get_streak` | `goal_id?: string` | Get streak (specific goal or global) |
| `mq_get_streak_milestones` | — | List streak milestone rewards |

### Assessment & State

| Tool | Parameters | Description |
|------|-----------|-------------|
| `mq_add_assessment` | `goal_id, assessment_type, result, source, notes?` | Record an assessment |
| `mq_get_assessments` | `goal_id: string, limit?: number` | Get assessment history |
| `mq_get_user_state` | `goal_id: string` | Get current user state for a goal |
| `mq_update_user_state` | `goal_id: string, ...state` | Update state (AI calls after inferring from assessments) |

### Settings

| Tool | Parameters | Description |
|------|-----------|-------------|
| `mq_get_settings` | — | Get global settings |
| `mq_update_settings` | `...partial settings` | Update settings |

### Dashboard

| Tool | Parameters | Description |
|------|-----------|-------------|
| `mq_get_dashboard` | — | Summary: all goals, today's tasks, wallet, streaks, replan status |
| `mq_get_progress_report` | `goal_id: string` | Detailed progress for a single goal |

---

## REST API Endpoints

The server exposes the same data as MCP tools via REST for the Web UI.

```
GET    /api/goals
POST   /api/goals
GET    /api/goals/:id
PATCH  /api/goals/:id
POST   /api/goals/:id/pause
POST   /api/goals/:id/resume
POST   /api/goals/:id/complete

GET    /api/goals/:id/plan
GET    /api/goals/:id/plan/history
GET    /api/goals/:id/plan/replan-status

GET    /api/tasks/today
GET    /api/tasks/optional
POST   /api/tasks/:id/complete
POST   /api/tasks/:id/skip

GET    /api/wallet
GET    /api/rewards
POST   /api/rewards
POST   /api/rewards/:id/redeem

GET    /api/streaks
GET    /api/streak-milestones

GET    /api/dashboard
GET    /api/goals/:id/progress

GET    /api/settings
PATCH  /api/settings

GET    /api/logs?limit=100   # activity log (max 200 entries, most recent first)

GET    /api/events   # SSE endpoint for real-time UI updates
```

---

## AI Behavior (SKILL.md Summary)

### Core Philosophy
The AI coach has no rigid templates. It reasons from first principles for each user's unique situation. All planning decisions are made by the AI; the server only persists and retrieves data.

### Key Behaviors

**Goal Clarification (onboarding)**
1. Ask: What does "success" look like specifically? (measurable)
2. Ask: What's the target timeline? (estimate if not given)
3. Ask: What lifestyle constraints exist? (time, tools, preferences)
4. Ask: What's the current level? (AI determines appropriate assessment questions per goal type)
5. Store as goal + generate initial plan

**Task Planning (Planning Layer — LLM)**
- Generate task template pool covering 7-14 days ahead
- Daily tasks: core tasks, difficulty 5-7/10, 1-3 per goal per day
- Optional tasks: supplementary challenges for motivated days
- No same tag consecutive days (variety enforcement)
- Coin reward = f(difficulty, estimated_duration, task_type)

**Multi-Goal Daily Balancing (Execution Layer — rule engine)**
```
daily_budget = UserSettings.daily_task_total_limit
goal_allocation[i] = round(budget × goal[i].daily_task_weight / sum(weights))
```

**Reward Pricing Review**
When user creates a reward conflicting with a goal:
- Food reward when goal = weight loss → multiply cost by 1.5-3x with explanation
- Neutral reward (book, movie) → no adjustment

**Replan Triggers (event-driven)**
| Event | Check | Trigger Condition |
|-------|-------|------------------|
| Task skipped | On each skip | 3-day skip rate > 50% |
| Optional completed | On each completion | 3-day optional rate > 80% |
| Task pool depleted | On complete/UI open | Pool remaining < 3 days |
| User chat signal | On message | Detects "too hard", "too busy", etc. |
| Assessment updated | On assessment add | Significant level change |

**Replan Flow (MVP — AI-driven)**
1. Server marks `replan_pending = true`
2. SKILL.md instructs AI to check `mq_get_replan_status()` at conversation start
3. If pending: AI reads full context → generates new plan → calls `mq_generate_plan()`
4. UI updates via SSE

---

## Daily Check Mechanism

**Two-layer design — no LLM for daily execution:**

| Layer | Frequency | LLM | Description |
|-------|-----------|-----|-------------|
| Planning | Per replan event | Yes | LLM generates task template pool |
| Execution | Daily | No | Rule engine selects today's tasks from pool |

**Daily check sequence (lazy evaluation + scheduled):**
1. Triggered on UI open OR by scheduler (node-cron at configured time)
2. Check if yesterday's daily tasks were all completed → update streak
3. Count today's tasks already allocated
4. If task pool depleted → mark replan_pending
5. Send OS notification if tasks pending (via node-notifier)

**Daemon mode:**
```
mochi-quest start --daemon   # server runs in background
mochi-quest setup            # install login auto-start (platform-specific)
```
- macOS: `~/Library/LaunchAgents/com.mochi-quest.plist`
- Windows: Startup folder + VBS wrapper
- Linux: `~/.config/systemd/user/mochi-quest.service`

---

## Integration System

Integrations provide **data collection** and **auto-completion detection** capabilities. They do not constrain how the AI plans.

### Adapter Interface

```typescript
interface IntegrationAdapter {
  id: string;
  name: string;
  sync(): Promise<SyncResult>;
  checkTaskCompletion(task: Task): Promise<boolean>;
}

interface SyncResult {
  assessments: Partial<Assessment>[];
  completed_task_ids: string[];
}
```

### Planned Adapters

| Adapter | Data Provided | MVP? |
|---------|--------------|------|
| Manual Report | Any goal (fallback) | Yes |
| Fitbit | Weight, body fat, exercise, sleep | Phase 4 |
| Garmin | Steps, heart rate, workouts | Phase 4 |
| Apple Health | Weight, steps, heart rate | Phase 4 |
| Duolingo | Daily study time, streak, lesson completions | Phase 4 |
| LeetCode | Daily submission, difficulty breakdown | Phase 4 |
| Habitica | Bidirectional task sync | Phase 4 |

---

## Gamification System

### Coins
- Earned by completing tasks
- Formula: `coin_reward = difficulty × duration_multiplier × task_type_multiplier`
  - `duration_multiplier`: 15min→1x, 30min→1.5x, 60min→2x, 90min→2.5x
  - `task_type_multiplier`: daily→1x, optional→1.2x
- Streak milestone bonuses: 7 days→50 coins, 30 days→200 coins, 100 days→1000 coins

### Rewards
- User-defined or AI-suggested
- AI audits pricing for goal conflicts
- Redemption deducts from `available_coins`

### Streak
- Per-goal streak: each goal tracks independently
- Global streak: all active goals' daily tasks completed = global streak +1
- Breaking streak resets to 0 (no coin penalty)
- Paused goals excluded from streak calculation

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Server | Node.js + TypeScript | MCP ecosystem compatibility |
| MCP Protocol | `@modelcontextprotocol/sdk` | Standard MCP implementation |
| REST API | Hono | Lightweight, same process |
| Database | SQLite (`better-sqlite3`) | Local persistence, zero deployment |
| Scheduler | `node-cron` | Built into server, cross-platform |
| Notifications | `node-notifier` | macOS/Windows/Linux native notifications |
| Web UI | Vite + React + TypeScript | User preference |
| UI Components | shadcn/ui + Tailwind CSS | Consistent design system |
| Package Manager | pnpm workspaces (monorepo) | Efficient dependency management |
| Skill | SKILL.md | Anthropic Agent Skills spec compatible |

---

## Directory Structure

```
mochi-quest/
├── README.md
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── packages/
│   ├── server/               # MCP Server + REST API
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts        # SQLite table definitions
│   │   │   │   ├── migrations/      # DB migration files
│   │   │   │   └── queries/         # typed query functions
│   │   │   ├── mcp/
│   │   │   │   ├── tools/           # one file per tool group
│   │   │   │   └── server.ts        # MCP server setup
│   │   │   ├── api/
│   │   │   │   ├── routes/          # Hono route handlers
│   │   │   │   └── server.ts        # Hono app setup
│   │   │   ├── scheduler/
│   │   │   │   ├── daily-check.ts   # streak update + notification logic
│   │   │   │   └── replan-trigger.ts # event-driven replan checks
│   │   │   ├── integrations/
│   │   │   │   ├── base.ts          # IntegrationAdapter interface
│   │   │   │   ├── manual.ts        # Manual report adapter
│   │   │   │   └── fitbit.ts        # Fitbit adapter (Phase 4)
│   │   │   ├── notifications.ts     # node-notifier wrapper
│   │   │   ├── setup.ts             # login auto-start installer
│   │   │   └── index.ts             # entry point (start + daemon + setup commands)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                  # Web UI
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Goals.tsx
│   │   │   │   ├── Plan.tsx          # roadmap + plan history
│   │   │   │   ├── Tasks.tsx         # daily + optional tasks
│   │   │   │   ├── Wallet.tsx        # coins + rewards
│   │   │   │   └── LogsPage.tsx      # activity log timeline
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   │   └── useSSE.ts         # SSE connection for real-time updates
│   │   │   └── lib/
│   │   │       └── api.ts            # REST API client
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── skill/
│       └── SKILL.md
└── docs/
    ├── spec.md                    # this document
    └── integration-guide.md       # how to add integration adapters
```

---

## Implementation Phases

### Phase 1: Core Scaffold
- SQLite schema + migrations
- MCP tools: Goal, Plan, Task, Wallet, Reward, Streak, Settings CRUD
- REST API layer (Hono)
- Basic `mq_get_dashboard`

### Phase 2: Web UI
- React + Vite + shadcn/ui setup
- Dashboard, Goals, Plan (roadmap), Tasks (daily/optional), Wallet, Logs pages
- SSE connection for real-time updates (replan badge, task completion sync)

### Phase 3: AI Behavior + Scheduler
- SKILL.md: goal clarification, task generation, reward auditing, replan execution
- Assessment MCP tools
- Event-driven replan trigger logic
- node-cron daily-check scheduler
- Cross-platform notifications + login auto-start

### Phase 4: Integrations + Automation
- Fitbit / Garmin / Duolingo / Apple Health adapters
- Habitica bidirectional sync
- Server-driven replan (server has its own LLM client)

---

## Verification

```bash
# 1. Start server
npx mochi-quest start

# 2. Connect in Claude Code
# Add to mcp_servers config:
# { "mochi-quest": { "command": "npx", "args": ["mochi-quest", "mcp"] } }

# 3. Test flow
# Tell Claude: "我想學好英文，目標是通過多益 750，目前程度大概 500"
# Expected: AI clarifies goal → stores in DB → generates plan → assigns first task

# 4. Verify data
mq_get_dashboard   # should show the goal, today's tasks, wallet balance
mq_get_today_tasks # should return 1-2 English tasks

# 5. Complete a task
mq_complete_task <id>  # should add coins, check streak

# 6. Verify streak + wallet
mq_get_wallet
mq_get_streak
```
