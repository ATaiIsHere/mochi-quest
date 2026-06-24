import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';
import { triggerReplan } from './replan.js';

export interface Assessment {
  id: string;
  goal_id: string;
  assessment_type: string;
  result: Record<string, unknown>;
  source: 'user_report' | 'integration' | 'ai_inference';
  notes: string | null;
  timestamp: string;
}

export interface UserState {
  goal_id: string;
  current_level_description: string;
  strengths: string[];
  weaknesses: string[];
  integration_configs: Record<string, unknown>;
  last_assessment_date: string | null;
  updated_at: string;
}

function parseAssessment(row: Record<string, unknown>): Assessment {
  return {
    ...row,
    result: JSON.parse(row.result as string || '{}'),
  } as Assessment;
}

function parseUserState(row: Record<string, unknown>): UserState {
  return {
    ...row,
    strengths: JSON.parse(row.strengths as string || '[]'),
    weaknesses: JSON.parse(row.weaknesses as string || '[]'),
    integration_configs: JSON.parse(row.integration_configs as string || '{}'),
  } as UserState;
}

export function addAssessment(input: {
  goal_id: string;
  assessment_type: string;
  result: Record<string, unknown>;
  source: Assessment['source'];
  notes?: string;
}): Assessment {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO assessments (id, goal_id, assessment_type, result, source, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.goal_id, input.assessment_type, JSON.stringify(input.result), input.source, input.notes ?? null);

  // Update last_assessment_date in user_state
  db.prepare(`
    INSERT INTO user_states (goal_id, last_assessment_date, updated_at)
    VALUES (?, date('now'), datetime('now'))
    ON CONFLICT(goal_id) DO UPDATE SET last_assessment_date = date('now'), updated_at = datetime('now')
  `).run(input.goal_id);

  // Trigger replan check
  triggerReplan(input.goal_id, 'assessment_change');

  return parseAssessment(db.prepare('SELECT * FROM assessments WHERE id = ?').get(id) as Record<string, unknown>);
}

export function getAssessments(goalId: string, limit = 10): Assessment[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM assessments WHERE goal_id = ? ORDER BY timestamp DESC LIMIT ?').all(goalId, limit);
  return (rows as Record<string, unknown>[]).map(parseAssessment);
}

export function getUserState(goalId: string): UserState | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_states WHERE goal_id = ?').get(goalId);
  return row ? parseUserState(row as Record<string, unknown>) : null;
}

export function updateUserState(goalId: string, updates: Partial<Omit<UserState, 'goal_id' | 'updated_at'>>): UserState {
  const db = getDb();
  const current = getUserState(goalId);

  if (!current) {
    db.prepare(`
      INSERT INTO user_states (goal_id, current_level_description, strengths, weaknesses, integration_configs)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      goalId,
      updates.current_level_description ?? '',
      JSON.stringify(updates.strengths ?? []),
      JSON.stringify(updates.weaknesses ?? []),
      JSON.stringify(updates.integration_configs ?? {}),
    );
  } else {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.current_level_description !== undefined) {
      fields.push('current_level_description = ?');
      values.push(updates.current_level_description);
    }
    if (updates.strengths !== undefined) {
      fields.push('strengths = ?');
      values.push(JSON.stringify(updates.strengths));
    }
    if (updates.weaknesses !== undefined) {
      fields.push('weaknesses = ?');
      values.push(JSON.stringify(updates.weaknesses));
    }
    if (updates.integration_configs !== undefined) {
      fields.push('integration_configs = ?');
      values.push(JSON.stringify(updates.integration_configs));
    }

    if (fields.length > 0) {
      db.prepare(`UPDATE user_states SET ${fields.join(', ')}, updated_at = datetime('now') WHERE goal_id = ?`).run(...values, goalId);
    }
  }

  return getUserState(goalId)!;
}
