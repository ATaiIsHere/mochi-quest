import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';
import { addMilestoneBonus } from './wallet.js';

const STREAK_MILESTONES = [
  { days: 7, bonus_coins: 50 },
  { days: 30, bonus_coins: 200 },
  { days: 100, bonus_coins: 1000 },
  { days: 365, bonus_coins: 5000 },
];

export interface Streak {
  id: string;
  goal_id: string | null;
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  updated_at: string;
}

export function getStreak(goalId?: string): Streak | null {
  const db = getDb();
  const row = goalId !== undefined
    ? db.prepare('SELECT * FROM streaks WHERE goal_id = ?').get(goalId)
    : db.prepare("SELECT * FROM streaks WHERE goal_id IS NULL AND id = 'global'").get();
  return row as Streak | null;
}

export function getAllStreaks(): Streak[] {
  const db = getDb();
  return db.prepare('SELECT * FROM streaks ORDER BY goal_id IS NULL DESC, goal_id').all() as Streak[];
}

export function ensureStreak(goalId: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM streaks WHERE goal_id = ?').get(goalId);
  if (!existing) {
    db.prepare('INSERT INTO streaks (id, goal_id) VALUES (?, ?)').run(randomUUID(), goalId);
  }
}

export function updateStreakOnComplete(goalId: string): void {
  ensureStreak(goalId);
  const today = new Date().toISOString().slice(0, 10);
  const streak = getStreak(goalId);
  if (!streak) return;

  const lastDate = streak.last_completed_date;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let newStreak: number;
  if (lastDate === today) {
    // Already counted today
    return;
  } else if (lastDate === yesterday) {
    newStreak = streak.current_streak + 1;
  } else {
    newStreak = 1;
  }

  const db = getDb();
  const longest = Math.max(newStreak, streak.longest_streak);
  db.prepare(`
    UPDATE streaks SET current_streak = ?, longest_streak = ?, last_completed_date = ?, updated_at = datetime('now')
    WHERE goal_id = ?
  `).run(newStreak, longest, today, goalId);

  checkMilestoneBonuses(goalId, newStreak, streak.current_streak);
  updateGlobalStreak();
}

export function updateStreakOnSkip(goalId: string): void {
  ensureStreak(goalId);
  const today = new Date().toISOString().slice(0, 10);
  const streak = getStreak(goalId);
  if (!streak) return;

  // Only break streak if we missed today entirely
  if (streak.last_completed_date !== today && streak.current_streak > 0) {
    const db = getDb();
    db.prepare(`
      UPDATE streaks SET current_streak = 0, updated_at = datetime('now') WHERE goal_id = ?
    `).run(goalId);
    updateGlobalStreak();
  }
}

function updateGlobalStreak(): void {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Check if all active goals have completed their daily tasks today
  const activeGoals = db.prepare("SELECT id FROM goals WHERE status = 'active'").all() as { id: string }[];
  if (activeGoals.length === 0) return;

  const allCompletedToday = activeGoals.every(g => {
    const s = getStreak(g.id);
    return s?.last_completed_date === today;
  });

  const globalStreak = getStreak();
  if (!globalStreak) return;

  if (allCompletedToday) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const lastDate = globalStreak.last_completed_date;
    let newStreak: number;

    if (lastDate === today) return;
    if (lastDate === yesterday) {
      newStreak = globalStreak.current_streak + 1;
    } else {
      newStreak = 1;
    }

    const longest = Math.max(newStreak, globalStreak.longest_streak);
    db.prepare(`
      UPDATE streaks SET current_streak = ?, longest_streak = ?, last_completed_date = ?, updated_at = datetime('now')
      WHERE id = 'global'
    `).run(newStreak, longest, today);

    checkMilestoneBonuses(null, newStreak, globalStreak.current_streak);
  }
}

function checkMilestoneBonuses(goalId: string | null, newStreak: number, oldStreak: number): void {
  const db = getDb();
  for (const milestone of STREAK_MILESTONES) {
    if (newStreak >= milestone.days && oldStreak < milestone.days) {
      // Check not already claimed
      const claimed = db.prepare(`
        SELECT id FROM streak_milestone_claims WHERE goal_id IS ? AND days = ?
      `).get(goalId, milestone.days);

      if (!claimed) {
        db.prepare(`
          INSERT INTO streak_milestone_claims (id, goal_id, days, bonus_coins) VALUES (?, ?, ?, ?)
        `).run(randomUUID(), goalId, milestone.days, milestone.bonus_coins);

        const label = goalId ? `Goal ${goalId}` : 'Global';
        addMilestoneBonus(milestone.bonus_coins, `${milestone.days}-day streak milestone! (${label})`);
      }
    }
  }
}

export function getStreakMilestones(): typeof STREAK_MILESTONES {
  return STREAK_MILESTONES;
}
