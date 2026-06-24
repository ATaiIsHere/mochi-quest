import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';

export interface Wallet {
  total_coins: number;
  available_coins: number;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  type: 'earned' | 'spent' | 'milestone_bonus';
  amount: number;
  description: string;
  source_id: string | null;
  timestamp: string;
}

export function getWallet(): Wallet {
  const db = getDb();
  return db.prepare('SELECT * FROM user_wallet WHERE id = 1').get() as Wallet;
}

export function getTransactions(limit = 20): WalletTransaction[] {
  const db = getDb();
  return db.prepare('SELECT * FROM wallet_transactions ORDER BY timestamp DESC LIMIT ?').all(limit) as WalletTransaction[];
}

export function addCoins(amount: number, description: string, sourceId?: string): void {
  const db = getDb();
  const txId = randomUUID();
  db.transaction(() => {
    db.prepare(`
      UPDATE user_wallet
      SET total_coins = total_coins + ?, available_coins = available_coins + ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(amount, amount);
    db.prepare(`
      INSERT INTO wallet_transactions (id, type, amount, description, source_id) VALUES (?, 'earned', ?, ?, ?)
    `).run(txId, amount, description, sourceId ?? null);
  })();
}

export function spendCoins(amount: number, description: string, sourceId?: string): boolean {
  const db = getDb();
  const wallet = getWallet();
  if (wallet.available_coins < amount) return false;

  const txId = randomUUID();
  db.transaction(() => {
    db.prepare(`
      UPDATE user_wallet
      SET available_coins = available_coins - ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(amount);
    db.prepare(`
      INSERT INTO wallet_transactions (id, type, amount, description, source_id) VALUES (?, 'spent', ?, ?, ?)
    `).run(txId, amount, description, sourceId ?? null);
  })();
  return true;
}

export function addMilestoneBonus(amount: number, description: string): void {
  const db = getDb();
  const txId = randomUUID();
  db.transaction(() => {
    db.prepare(`
      UPDATE user_wallet
      SET total_coins = total_coins + ?, available_coins = available_coins + ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(amount, amount);
    db.prepare(`
      INSERT INTO wallet_transactions (id, type, amount, description, source_id) VALUES (?, 'milestone_bonus', ?, ?, NULL)
    `).run(txId, amount, description);
  })();
}
