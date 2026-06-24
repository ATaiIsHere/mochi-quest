import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';

export interface Goal {
  id: string;
  title: string;
  category: string;
  definition: string;
  success_criteria: string;
  deadline: string | null;
  lifestyle_context: Record<string, unknown>;
  daily_task_weight: number;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}

function parseGoal(row: Record<string, unknown>): Goal {
  return {
    ...row,
    lifestyle_context: JSON.parse(row.lifestyle_context as string || '{}'),
  } as Goal;
}

export function listGoals(status?: string): Goal[] {
  const db = getDb();
  const rows = status
    ? db.prepare('SELECT * FROM goals WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all();
  return (rows as Record<string, unknown>[]).map(parseGoal);
}

export function getGoal(id: string): Goal | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  return row ? parseGoal(row as Record<string, unknown>) : null;
}

export interface CreateGoalInput {
  title: string;
  category?: string;
  definition?: string;
  success_criteria?: string;
  deadline?: string;
  lifestyle_context?: Record<string, unknown>;
  daily_task_weight?: number;
}

export function createGoal(input: CreateGoalInput): Goal {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO goals (id, title, category, definition, success_criteria, deadline, lifestyle_context, daily_task_weight)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.title,
    input.category ?? '',
    input.definition ?? '',
    input.success_criteria ?? '',
    input.deadline ?? null,
    JSON.stringify(input.lifestyle_context ?? {}),
    input.daily_task_weight ?? 3,
  );
  return getGoal(id)!;
}

export function updateGoal(id: string, updates: Partial<Omit<Goal, 'id' | 'created_at'>>): Goal | null {
  const db = getDb();
  const fields = Object.keys(updates).filter(k => k !== 'updated_at');
  if (fields.length === 0) return getGoal(id);

  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => {
    const val = updates[f as keyof typeof updates];
    return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
  });

  db.prepare(`UPDATE goals SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  return getGoal(id);
}

export function setGoalStatus(id: string, status: 'active' | 'paused' | 'completed'): Goal | null {
  return updateGoal(id, { status });
}
