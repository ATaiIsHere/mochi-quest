import cron from 'node-cron';
import { getTodayTasks } from './db/queries/tasks.js';
import { updateStreakOnSkip } from './db/queries/streaks.js';
import { listGoals } from './db/queries/goals.js';
import { getActivePlan, isCycleComplete } from './db/queries/plans.js';
import { getSettings } from './db/queries/settings.js';
import { checkAndTriggerReplan, triggerReplan } from './db/queries/replan.js';
import { writeLog } from './db/queries/logs.js';
import { getDb } from './db/schema.js';

let scheduledTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  const settings = getSettings();
  const [hour, minute] = settings.daily_check_time.split(':').map(Number);

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  scheduledTask = cron.schedule(`${minute ?? 0} ${hour ?? 4} * * *`, () => {
    runSystemCheck().catch(err => console.error('[scheduler] daily-check error:', err));
  }, {
    timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  console.log(`[scheduler] Daily check scheduled at ${settings.daily_check_time}`);
}

export async function runSystemCheck(): Promise<void> {
  const db = getDb();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const activeGoals = listGoals('active');
  const goalsChecked: string[] = [];

  for (const goal of activeGoals) {
    // Update streak if yesterday's daily tasks weren't all completed
    const { count: completedCount } = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE goal_id=? AND task_type='daily' AND due_date=? AND status='completed'`
    ).get(goal.id, yesterday) as { count: number };

    const { count: totalCount } = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE goal_id=? AND task_type='daily' AND due_date=?`
    ).get(goal.id, yesterday) as { count: number };

    if (totalCount > 0 && completedCount < totalCount) {
      updateStreakOnSkip(goal.id);
    }

    // Check if cycle is complete
    const plan = getActivePlan(goal.id);
    if (plan && isCycleComplete(plan) && !plan.replan_pending) {
      triggerReplan(goal.id, 'cycle_complete');
    } else if (plan && !plan.replan_pending) {
      // Run comprehensive replan check (skip rate + optional completion)
      checkAndTriggerReplan(goal.id, 'daily_check');
    }

    goalsChecked.push(goal.id);
  }

  // Allocate today's tasks (no-op if already allocated)
  getTodayTasks();

  writeLog({
    event_type: 'daily_check_run',
    title: '每日排程執行',
    reason: `goals: ${goalsChecked.length}`,
    metadata: { goals_checked: goalsChecked.length },
  });

  console.log(`[scheduler] Daily check complete. ${activeGoals.length} goals checked.`);
}

export function stopScheduler(): void {
  scheduledTask?.stop();
  scheduledTask = null;
}
