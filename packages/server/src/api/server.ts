import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subscribeToSse } from '../db/queries/replan.js';
import { sendDiscordNotification } from './notify.js';
import { listGoals, getGoal, createGoal, updateGoal, setGoalStatus } from '../db/queries/goals.js';
import { getActivePlan, getPlanHistory, getReplanPending } from '../db/queries/plans.js';
import { getTodayTasks, getOptionalTasks, completeTask, skipTask } from '../db/queries/tasks.js';
import { getWallet, getTransactions } from '../db/queries/wallet.js';
import { listRewards, redeemReward } from '../db/queries/rewards.js';
import { getAllStreaks, getStreakMilestones } from '../db/queries/streaks.js';
import { getSettings, updateSettings } from '../db/queries/settings.js';
import { getLogs } from '../db/queries/logs.js';
import { getGoal as _getGoal } from '../db/queries/goals.js';
import { getActivePlan as _getActivePlan } from '../db/queries/plans.js';
import { getUserState, getAssessments } from '../db/queries/assessments.js';
import { getTaskHistory } from '../db/queries/tasks.js';
import { getStreak } from '../db/queries/streaks.js';

const app = new Hono();

const WEB_DIST_DIR = resolve(
  process.env.MOCHI_QUEST_WEB_DIST
    ?? join(dirname(fileURLToPath(import.meta.url)), '../../../web/dist'),
);

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function safeWebPath(requestPath: string): string | null {
  try {
    const decoded = decodeURIComponent(requestPath);
    const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = resolve(WEB_DIST_DIR, normalized);
    return filePath === WEB_DIST_DIR || filePath.startsWith(`${WEB_DIST_DIR}${sep}`) ? filePath : null;
  } catch {
    return null;
  }
}

async function serveWebFile(requestPath: string): Promise<Response> {
  const filePath = safeWebPath(requestPath);
  if (!filePath) return new Response('Not found', { status: 404 });

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return new Response('Not found', { status: 404 });
    const content = await readFile(filePath);
    return new Response(new Uint8Array(content), {
      headers: {
        'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// CORS for local dev
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return new Response('', { status: 204 });
  await next();
});

app.get('/health', (c) => c.json({ ok: true }));

// SSE endpoint for real-time updates
app.get('/api/events', (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('connected', { message: 'SSE connected' });

      const unsubscribe = subscribeToSse(event => {
        send(event.type, event.data);
      });

      // Heartbeat
      const heartbeat = setInterval(() => {
        send('ping', { timestamp: new Date().toISOString() });
      }, 30000);

      c.req.raw.signal?.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Goals
app.get('/api/goals', (c) => {
  const status = c.req.query('status');
  return c.json(listGoals(status));
});

app.post('/api/goals', async (c) => {
  const body = await c.req.json();
  return c.json(createGoal(body), 201);
});

app.get('/api/goals/:id', (c) => {
  const goal = getGoal(c.req.param('id'));
  if (!goal) return c.json({ error: 'Not found' }, 404);
  return c.json(goal);
});

app.patch('/api/goals/:id', async (c) => {
  const body = await c.req.json();
  const goal = updateGoal(c.req.param('id'), body);
  if (!goal) return c.json({ error: 'Not found' }, 404);
  return c.json(goal);
});

app.post('/api/goals/:id/pause', (c) => c.json(setGoalStatus(c.req.param('id'), 'paused')));
app.post('/api/goals/:id/resume', (c) => c.json(setGoalStatus(c.req.param('id'), 'active')));
app.post('/api/goals/:id/complete', (c) => c.json(setGoalStatus(c.req.param('id'), 'completed')));

// Plans
app.get('/api/goals/:id/plan', (c) => {
  const plan = getActivePlan(c.req.param('id'));
  return c.json(plan ?? { plan: null });
});

app.get('/api/goals/:id/plan/history', (c) => c.json(getPlanHistory(c.req.param('id'))));

app.get('/api/goals/:id/plan/replan-status', (c) => {
  const pending = getReplanPending();
  const found = pending.find(p => p.goal_id === c.req.param('id'));
  return c.json({ pending: !!found, reason: found?.created_reason ?? null });
});

// Tasks
app.get('/api/tasks/today', (c) => c.json(getTodayTasks()));
app.get('/api/tasks/optional', (c) => {
  const goalId = c.req.query('goal_id');
  return c.json(getOptionalTasks(goalId));
});

app.post('/api/tasks/:id/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const task = completeTask(c.req.param('id'), body.notes);
  if (!task) return c.json({ error: 'Not found' }, 404);
  return c.json(task);
});

app.post('/api/tasks/:id/skip', async (c) => {
  const body = await c.req.json();
  const task = skipTask(c.req.param('id'), body.reason ?? '');
  if (!task) return c.json({ error: 'Not found' }, 404);
  return c.json(task);
});

// Wallet & Rewards
app.get('/api/wallet', (c) => c.json({ ...getWallet(), transactions: getTransactions(20) }));
app.get('/api/rewards', (c) => c.json(listRewards(c.req.query('status'))));
app.post('/api/rewards/:id/redeem', (c) => c.json(redeemReward(c.req.param('id'))));

// Streaks
app.get('/api/streaks', (c) => c.json({ streaks: getAllStreaks(), milestones: getStreakMilestones() }));

// Settings
app.get('/api/settings', (c) => c.json(getSettings()));
app.patch('/api/settings', async (c) => {
  const body = await c.req.json();
  return c.json(updateSettings(body));
});

// Activity logs
app.get('/api/logs', (c) => {
  const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query('limit') ?? '100', 10)));
  return c.json({ logs: getLogs(limit) });
});

// Notifications
app.post('/api/notify', async (c) => {
  const { message } = await c.req.json() as { message?: string };
  if (!message) return c.json({ error: 'message required' }, 400);

  try {
    await sendDiscordNotification(message);
    return c.json({ sent: true });
  } catch (err) {
    console.error('[notify] Failed to send Discord notification:', err);
    return c.json({ error: 'Failed to send notification' }, 502);
  }
});

// Agent webhook subscription
app.post('/api/subscriptions', async (c) => {
  const { webhook_url, events } = await c.req.json() as { webhook_url: string; events?: string[] };
  if (!webhook_url) return c.json({ error: 'webhook_url required' }, 400);
  updateSettings({ agent_webhook_url: webhook_url, agent_webhook_events: (events ?? []).join(',') });
  return c.json({ ok: true });
});

// Dashboard
app.get('/api/dashboard', (c) => {
  const goals = listGoals('active');
  const todayTasks = getTodayTasks();
  const wallet = getWallet();
  const streaks = getAllStreaks();
  const pendingReplans = getReplanPending();

  const goalSummaries = goals.map(goal => {
    const plan = _getActivePlan(goal.id);
    const state = getUserState(goal.id);
    const goalTasks = todayTasks.filter(t => t.goal_id === goal.id);
    const streak = streaks.find(s => s.goal_id === goal.id);
    return {
      ...goal,
      current_level: state?.current_level_description ?? '',
      active_plan_phase: plan?.current_phase ?? null,
      replan_pending: plan?.replan_pending ?? false,
      today_tasks: goalTasks,
      today_completed: goalTasks.filter(t => t.status === 'completed').length,
      current_streak: streak?.current_streak ?? 0,
    };
  });

  return c.json({
    goals: goalSummaries,
    today_progress: {
      completed: todayTasks.filter(t => t.status === 'completed').length,
      total: todayTasks.length,
    },
    wallet: { available_coins: wallet.available_coins, total_earned: wallet.total_coins },
    global_streak: streaks.find(s => s.goal_id === null)?.current_streak ?? 0,
    pending_replans: pendingReplans.length,
  });
});

// Progress report
app.get('/api/goals/:id/progress', (c) => {
  const id = c.req.param('id');
  const goal = _getGoal(id);
  if (!goal) return c.json({ error: 'Not found' }, 404);

  return c.json({
    goal,
    current_state: getUserState(id),
    active_plan: _getActivePlan(id),
    recent_assessments: getAssessments(id, 5),
    streak: getStreak(id),
    recent_tasks: getTaskHistory(id, 10),
  });
});

// Built web dashboard. API routes stay JSON-only; all other GET routes fall back
// to index.html so the React router works in production and Docker.
app.get('/assets/*', (c) => serveWebFile(c.req.path.slice(1)));
app.get('/favicon.ico', () => serveWebFile('favicon.ico'));
app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  return serveWebFile('index.html');
});

export function startApiServer(port = Number.parseInt(process.env.PORT ?? process.env.MOCHI_QUEST_PORT ?? '3030', 10)): void {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Mochi Quest UI available at http://localhost:${port}`);
  });
}
