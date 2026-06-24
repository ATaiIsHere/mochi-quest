import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';
import { spendCoins } from './wallet.js';

export interface GoalImpact {
  goal_id: string;
  impact_level: 'none' | 'minor' | 'significant';
  reason: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string | null;
  coin_cost: number;
  category: 'food' | 'leisure' | 'purchase' | 'experience' | 'custom';
  goal_impact: GoalImpact[];
  suggested_cost_multiplier: number | null;
  source: 'user_defined' | 'ai_suggested';
  status: 'active' | 'redeemed' | 'archived';
  created_at: string;
}

function parseReward(row: Record<string, unknown>): Reward {
  return {
    ...row,
    goal_impact: JSON.parse(row.goal_impact as string || '[]'),
  } as Reward;
}

export function listRewards(status?: string): Reward[] {
  const db = getDb();
  const rows = status
    ? db.prepare('SELECT * FROM rewards WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM rewards ORDER BY created_at DESC').all();
  return (rows as Record<string, unknown>[]).map(parseReward);
}

export function getReward(id: string): Reward | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM rewards WHERE id = ?').get(id);
  return row ? parseReward(row as Record<string, unknown>) : null;
}

export interface CreateRewardInput {
  title: string;
  description?: string;
  coin_cost: number;
  category?: Reward['category'];
  goal_impact?: GoalImpact[];
  suggested_cost_multiplier?: number;
  source?: 'user_defined' | 'ai_suggested';
}

export function createReward(input: CreateRewardInput): Reward {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO rewards (id, title, description, coin_cost, category, goal_impact, suggested_cost_multiplier, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.title,
    input.description ?? null,
    input.coin_cost,
    input.category ?? 'custom',
    JSON.stringify(input.goal_impact ?? []),
    input.suggested_cost_multiplier ?? null,
    input.source ?? 'user_defined',
  );
  return getReward(id)!;
}

export function redeemReward(id: string): { success: boolean; message: string } {
  const reward = getReward(id);
  if (!reward) return { success: false, message: 'Reward not found' };
  if (reward.status !== 'active') return { success: false, message: 'Reward already redeemed or archived' };

  const success = spendCoins(reward.coin_cost, `Redeemed: ${reward.title}`, id);
  if (!success) return { success: false, message: 'Insufficient coins' };

  const db = getDb();
  db.prepare("UPDATE rewards SET status = 'redeemed' WHERE id = ?").run(id);
  return { success: true, message: `Redeemed "${reward.title}" for ${reward.coin_cost} coins!` };
}

export function updateRewardGoalImpact(id: string, goalImpact: GoalImpact[], suggestedMultiplier?: number): void {
  const db = getDb();
  db.prepare('UPDATE rewards SET goal_impact = ?, suggested_cost_multiplier = ? WHERE id = ?').run(
    JSON.stringify(goalImpact),
    suggestedMultiplier ?? null,
    id,
  );
}
