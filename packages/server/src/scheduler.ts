import cron from 'node-cron';
import notifier from 'node-notifier';
import { getDb } from './db/schema.js';
import { getTodayTasks } from './db/queries/tasks.js';
import { updateStreakOnSkip } from './db/queries/streaks.js';
import { listGoals } from './db/queries/goals.js';
import { getSettings } from './db/queries/settings.js';

let scheduledTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  scheduleFromSettings();
}

function scheduleFromSettings(): void {
  const settings = getSettings();
  const [hour, minute] = settings.notification_time.split(':').map(Number);

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  // Re-read settings every time the cron fires, in case user updated notification_time
  scheduledTask = cron.schedule(`${minute ?? 0} ${hour ?? 8} * * *`, () => {
    runDailyCheck().catch(err => console.error('[scheduler] daily-check error:', err));
  }, {
    timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  console.log(`[scheduler] Daily check scheduled at ${settings.notification_time}`);
}

async function runDailyCheck(): Promise<void> {
  const db = getDb();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const activeGoals = listGoals('active');

  for (const goal of activeGoals) {
    const { count: completedCount } = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE goal_id=? AND task_type='daily' AND due_date=? AND status='completed'`
    ).get(goal.id, yesterday) as { count: number };

    const { count: totalCount } = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE goal_id=? AND task_type='daily' AND due_date=?`
    ).get(goal.id, yesterday) as { count: number };

    if (totalCount > 0 && completedCount < totalCount) {
      updateStreakOnSkip(goal.id);
    }
  }

  const todayTasks = getTodayTasks();
  const pendingCount = todayTasks.filter(t => t.status === 'pending').length;

  if (pendingCount > 0) {
    notifier.notify({
      title: 'Mochi Quest',
      message: `今天有 ${pendingCount} 個任務等你完成！`,
      open: 'http://localhost:3030',
      sound: false,
    });
    console.log(`[scheduler] Notified: ${pendingCount} pending tasks`);
  } else {
    console.log('[scheduler] Daily check: all tasks done or no tasks today');
  }
}

export function stopScheduler(): void {
  scheduledTask?.stop();
  scheduledTask = null;
}
