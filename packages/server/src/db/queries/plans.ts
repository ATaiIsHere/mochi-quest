import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';
import { writeLog } from './logs.js';

export interface Milestone {
  title: string;
  description: string;
  target_date: string;
  success_criteria: string;
  is_completed: boolean;
  completed_at?: string;
}

export interface TaskTemplate {
  title: string;
  description: string;
  instructions: string;
  task_type: 'daily' | 'optional';
  difficulty: number;
  estimated_duration: string;
  coin_reward: number;
  completion_criteria: string;
  completion_method: 'manual' | 'auto';
  tags: string[];
}

export interface Plan {
  id: string;
  goal_id: string;
  version: number;
  is_active: boolean;
  milestones: Milestone[];
  current_phase: string;
  task_template_pool: TaskTemplate[];
  replan_pending: boolean;
  created_reason: string;
  created_at: string;
}

function parsePlan(row: Record<string, unknown>): Plan {
  return {
    ...row,
    is_active: Boolean(row.is_active),
    replan_pending: Boolean(row.replan_pending),
    milestones: JSON.parse(row.milestones as string || '[]'),
    task_template_pool: JSON.parse(row.task_template_pool as string || '[]'),
  } as Plan;
}

export function getActivePlan(goalId: string): Plan | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM plans WHERE goal_id = ? AND is_active = 1').get(goalId);
  return row ? parsePlan(row as Record<string, unknown>) : null;
}

export function getPlanHistory(goalId: string): Plan[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM plans WHERE goal_id = ? ORDER BY version DESC').all(goalId);
  return (rows as Record<string, unknown>[]).map(parsePlan);
}

export interface CreatePlanInput {
  goal_id: string;
  milestones?: Milestone[];
  current_phase?: string;
  task_template_pool?: TaskTemplate[];
  created_reason?: string;
}

export function createPlan(input: CreatePlanInput): Plan {
  const db = getDb();
  const id = randomUUID();

  // Get next version number
  const lastVersion = (db.prepare('SELECT MAX(version) as v FROM plans WHERE goal_id = ?').get(input.goal_id) as { v: number | null }).v ?? 0;

  db.transaction(() => {
    // Deactivate existing plan
    db.prepare('UPDATE plans SET is_active = 0 WHERE goal_id = ? AND is_active = 1').run(input.goal_id);

    db.prepare(`
      INSERT INTO plans (id, goal_id, version, is_active, milestones, current_phase, task_template_pool, created_reason)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      input.goal_id,
      lastVersion + 1,
      JSON.stringify(input.milestones ?? []),
      input.current_phase ?? '',
      JSON.stringify(input.task_template_pool ?? []),
      input.created_reason ?? 'initial',
    );
  })();

  const plan = getActivePlan(input.goal_id)!;
  writeLog({ event_type: 'plan_created', entity_type: 'plan', entity_id: id, goal_id: input.goal_id, title: `建立計劃 v${plan.version}`, reason: input.created_reason ?? 'initial' });
  return plan;
}

export function setReplanPending(goalId: string, pending: boolean): void {
  const db = getDb();
  db.prepare('UPDATE plans SET replan_pending = ? WHERE goal_id = ? AND is_active = 1').run(pending ? 1 : 0, goalId);
}

export function getReplanPending(): { goal_id: string; created_reason: string }[] {
  const db = getDb();
  return db.prepare('SELECT goal_id, created_reason FROM plans WHERE replan_pending = 1 AND is_active = 1').all() as { goal_id: string; created_reason: string }[];
}

export function updateTaskTemplatePool(goalId: string, pool: TaskTemplate[]): void {
  const db = getDb();
  db.prepare('UPDATE plans SET task_template_pool = ? WHERE goal_id = ? AND is_active = 1').run(JSON.stringify(pool), goalId);
}
