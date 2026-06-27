import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';
import { getActivePlan, updateTaskTemplatePool } from './plans.js';
import { listGoals } from './goals.js';
import { addCoins } from './wallet.js';
import { updateStreakOnComplete, updateStreakOnSkip } from './streaks.js';
import { checkAndTriggerReplan, triggerReplan } from '../queries/replan.js';
import { writeLog } from './logs.js';
import { emitEvent } from '../../events.js';

export interface Task {
  id: string;
  plan_id: string;
  goal_id: string;
  title: string;
  description: string;
  instructions: string;
  task_type: 'daily' | 'optional';
  difficulty: number;
  estimated_duration: string;
  due_date: string | null;
  coin_reward: number;
  completion_criteria: string;
  completion_method: 'manual' | 'auto';
  tags: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

function parseTask(row: Record<string, unknown>): Task {
  return {
    ...row,
    tags: JSON.parse(row.tags as string || '[]'),
  } as Task;
}

export function getTodayTasks(): Task[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Get today's pending daily tasks
  const existing = db.prepare(`
    SELECT * FROM tasks
    WHERE task_type = 'daily' AND due_date = ? AND status IN ('pending', 'in_progress')
    ORDER BY goal_id, created_at
  `).all(today);

  if ((existing as unknown[]).length > 0) {
    return (existing as Record<string, unknown>[]).map(parseTask);
  }

  // Allocate today's tasks from template pools
  return allocateDailyTasks(today);
}

function allocateDailyTasks(date: string): Task[] {
  const db = getDb();
  const activeGoals = listGoals('active');
  if (activeGoals.length === 0) return [];

  const allocated: Task[] = [];

  for (const goal of activeGoals) {
    const plan = getActivePlan(goal.id);
    if (!plan) continue;

    if (plan.daily_schedule.length > 0 && plan.cycle_start_date) {
      // Cycle-based scheduling
      const cycleStart = new Date(plan.cycle_start_date);
      const today = new Date(date);
      cycleStart.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      const dayInCycle = Math.floor((today.getTime() - cycleStart.getTime()) / 86400000) + 1;

      if (dayInCycle > plan.cycle_days) {
        // Cycle ended — signal for replan; no tasks allocated until replanned
        if (!plan.replan_pending) {
          triggerReplan(goal.id, 'cycle_complete');
          emitEvent('cycle_ended', {
            goal_id: goal.id,
            title: '週期結束',
            metadata: { cycle_days: plan.cycle_days, day_in_cycle: dayInCycle },
          });
        }
        continue;
      }

      const daySchedule = plan.daily_schedule.find(d => d.day === dayInCycle);
      if (daySchedule) {
        for (const template of daySchedule.tasks) {
          const task = createTask({ plan_id: plan.id, goal_id: goal.id, ...template, task_type: 'daily', due_date: date });
          allocated.push(task);
        }
      }

      // Create optional tasks once for the whole cycle (idempotent)
      if (plan.optional_template_pool.length > 0) {
        const existingOptional = (db.prepare(
          "SELECT COUNT(*) as count FROM tasks WHERE plan_id = ? AND task_type = 'optional'"
        ).get(plan.id) as { count: number }).count;

        if (existingOptional === 0) {
          for (const template of plan.optional_template_pool) {
            createTask({ plan_id: plan.id, goal_id: goal.id, ...template, task_type: 'optional' });
          }
        }
      }
    } else if (plan.task_template_pool.length > 0) {
      // Legacy sequential pool (backward compatibility): one template per goal per day.
      const pool = plan.task_template_pool.filter(t => t.task_type === 'daily');
      const selected = pool.slice(0, 1);

      for (const template of selected) {
        const task = createTask({ plan_id: plan.id, goal_id: goal.id, ...template, due_date: date });
        allocated.push(task);
      }

      const remaining = plan.task_template_pool.filter(t => !selected.includes(t));
      updateTaskTemplatePool(goal.id, remaining);
    }
  }

  if (allocated.length > 0) {
    writeLog({ event_type: 'daily_allocated', title: `今日任務分配：${date}（${allocated.length} 個）`, metadata: { date, count: allocated.length } });
  }
  return allocated;
}

export function getOptionalTasks(goalId?: string): Task[] {
  const db = getDb();
  const query = goalId
    ? `SELECT * FROM tasks WHERE task_type = 'optional' AND status = 'pending' AND goal_id = ? ORDER BY created_at DESC LIMIT 10`
    : `SELECT * FROM tasks WHERE task_type = 'optional' AND status = 'pending' ORDER BY created_at DESC LIMIT 10`;
  const rows = goalId ? db.prepare(query).all(goalId) : db.prepare(query).all();
  return (rows as Record<string, unknown>[]).map(parseTask);
}

export interface CreateTaskInput {
  plan_id: string;
  goal_id: string;
  title: string;
  description?: string;
  instructions?: string;
  task_type?: 'daily' | 'optional';
  difficulty?: number;
  estimated_duration?: string;
  due_date?: string;
  coin_reward?: number;
  completion_criteria?: string;
  completion_method?: 'manual' | 'auto';
  tags?: string[];
}

export function createTask(input: CreateTaskInput): Task {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO tasks (id, plan_id, goal_id, title, description, instructions, task_type, difficulty,
      estimated_duration, due_date, coin_reward, completion_criteria, completion_method, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.plan_id,
    input.goal_id,
    input.title,
    input.description ?? '',
    input.instructions ?? '',
    input.task_type ?? 'daily',
    input.difficulty ?? 5,
    input.estimated_duration ?? '30 minutes',
    input.due_date ?? null,
    input.coin_reward ?? 10,
    input.completion_criteria ?? '',
    input.completion_method ?? 'manual',
    JSON.stringify(input.tags ?? []),
  );
  return getTask(id)!;
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return row ? parseTask(row as Record<string, unknown>) : null;
}

export function completeTask(id: string, notes?: string): Task | null {
  const db = getDb();
  const task = getTask(id);
  if (!task || task.status === 'completed') return task;

  db.prepare(`
    UPDATE tasks SET status = 'completed', notes = ?, completed_at = datetime('now') WHERE id = ?
  `).run(notes ?? null, id);

  // Add coins
  addCoins(task.coin_reward, `Completed: ${task.title}`, id);

  // Update streak for daily tasks
  if (task.task_type === 'daily') {
    updateStreakOnComplete(task.goal_id);
  }

  // Check if replan needed (for daily tasks only; optional completion now handled via webhook)
  if (task.task_type !== 'optional') {
    checkAndTriggerReplan(task.goal_id, 'task_completed');
  }

  // Compute completion rates for event payload
  const optionalStats = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM tasks WHERE plan_id = ? AND task_type = 'optional'"
  ).get(task.plan_id) as { total: number; completed: number };
  const optional_completion_rate = optionalStats.total > 0 ? optionalStats.completed / optionalStats.total : 0;

  const today = new Date().toISOString().slice(0, 10);
  const dailyStats = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM tasks WHERE goal_id = ? AND task_type = 'daily' AND due_date = ?"
  ).get(task.goal_id, today) as { total: number; completed: number };
  const daily_completion_rate = dailyStats.total > 0 ? dailyStats.completed / dailyStats.total : 0;

  emitEvent('task_completed', {
    entity_type: 'task',
    entity_id: id,
    goal_id: task.goal_id,
    title: `完成任務：${task.title}`,
    metadata: { task_id: id, task_type: task.task_type, coin_reward: task.coin_reward, optional_completion_rate, daily_completion_rate },
  });

  return getTask(id);
}

export function skipTask(id: string, reason: string): Task | null {
  const db = getDb();
  const task = getTask(id);
  if (!task) return null;

  db.prepare(`UPDATE tasks SET status = 'skipped', notes = ? WHERE id = ?`).run(reason, id);

  if (task.task_type === 'daily') {
    updateStreakOnSkip(task.goal_id);
    checkAndTriggerReplan(task.goal_id, 'task_skipped');
  }

  emitEvent('task_skipped', {
    entity_type: 'task',
    entity_id: id,
    goal_id: task.goal_id,
    title: `略過任務：${task.title}`,
    reason,
    metadata: { task_id: id, task_type: task.task_type },
  });

  return getTask(id);
}

export function getTaskHistory(goalId: string, limit = 20): Task[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM tasks WHERE goal_id = ? AND status IN ('completed', 'skipped')
    ORDER BY completed_at DESC LIMIT ?
  `).all(goalId, limit);
  return (rows as Record<string, unknown>[]).map(parseTask);
}

export function getSkipRateLast3Days(goalId: string): number {
  const db = getDb();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
    FROM tasks
    WHERE goal_id = ? AND task_type = 'daily' AND due_date >= ?
  `).get(goalId, threeDaysAgo) as { total: number; skipped: number };

  if (!result || result.total === 0) return 0;
  return result.skipped / result.total;
}

export function getOptionalCompletionRateLast3Days(goalId: string): number {
  const db = getDb();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM tasks
    WHERE goal_id = ? AND task_type = 'optional' AND created_at >= ?
  `).get(goalId, threeDaysAgo) as { total: number; completed: number };

  if (!result || result.total === 0) return 0;
  return result.completed / result.total;
}
