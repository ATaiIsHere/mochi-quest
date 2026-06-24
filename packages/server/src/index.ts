#!/usr/bin/env node
import { startMcpServer } from './mcp/server.js';
import { startApiServer } from './api/server.js';
import { startScheduler } from './scheduler.js';

const command = process.argv[2] ?? 'start';
const flags = process.argv.slice(3);

switch (command) {
  case 'mcp':
    // MCP-only mode (for agent connections)
    await startMcpServer();
    break;

  case 'start': {
    const isDaemon = flags.includes('--daemon');
    if (isDaemon) {
      console.log('Starting Mochi Quest in daemon mode...');
    }
    startApiServer(3030);
    startScheduler();
    await startMcpServer();
    break;
  }

  case 'daily-check':
    // Lightweight daily check — no LLM, pure DB
    await runDailyCheck();
    break;

  case 'setup':
    await runSetup();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    console.log('Usage: mochi-quest [start|mcp|daily-check|setup] [--daemon]');
    process.exit(1);
}

async function runDailyCheck(): Promise<void> {
  const { getDb } = await import('./db/schema.js');
  const { getTodayTasks } = await import('./db/queries/tasks.js');
  const { updateStreakOnSkip } = await import('./db/queries/streaks.js');
  const { listGoals } = await import('./db/queries/goals.js');
  const notifier = await import('node-notifier');

  // Ensure DB is initialized
  getDb();

  // Check yesterday's completion and update streaks
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const activeGoals = listGoals('active');

  for (const goal of activeGoals) {
    const db = getDb();
    const yesterdayCompleted = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE goal_id = ? AND task_type = 'daily' AND due_date = ? AND status = 'completed'
    `).get(goal.id, yesterday) as { count: number };

    const yesterdayTotal = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE goal_id = ? AND task_type = 'daily' AND due_date = ?
    `).get(goal.id, yesterday) as { count: number };

    if (yesterdayTotal.count > 0 && yesterdayCompleted.count < yesterdayTotal.count) {
      updateStreakOnSkip(goal.id);
    }
  }

  // Get today's tasks
  const todayTasks = getTodayTasks();
  const pendingCount = todayTasks.filter(t => t.status === 'pending').length;

  if (pendingCount > 0) {
    notifier.default.notify({
      title: 'Mochi Quest 🎯',
      message: `今天有 ${pendingCount} 個任務等你完成！`,
      open: 'http://localhost:3030',
    });
  }

  console.log(`Daily check complete. ${pendingCount} tasks pending today.`);
}

async function runSetup(): Promise<void> {
  const os = await import('node:os');
  const platform = os.platform();
  console.log(`Setting up Mochi Quest for ${platform}...`);
  console.log('TODO: Install auto-start for your platform:');
  console.log('  macOS:   ~/Library/LaunchAgents/com.mochi-quest.plist');
  console.log('  Linux:   ~/.config/systemd/user/mochi-quest.service');
  console.log('  Windows: Startup folder');
  console.log('\nFor now, add this to your shell profile to start manually:');
  console.log('  alias mq="npx mochi-quest start --daemon"');
}
