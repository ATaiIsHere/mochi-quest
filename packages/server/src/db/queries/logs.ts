import { randomUUID } from 'node:crypto';
import { getDb } from '../schema.js';

export interface ActivityLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  goal_id: string | null;
  title: string;
  reason: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

function parseLog(row: Record<string, unknown>): ActivityLog {
  return {
    ...row,
    metadata: JSON.parse(row.metadata as string || '{}'),
  } as ActivityLog;
}

export interface WriteLogInput {
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  goal_id?: string;
  title: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export function writeLog(input: WriteLogInput): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO activity_logs (id, event_type, entity_type, entity_id, goal_id, title, reason, metadata, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.event_type,
    input.entity_type ?? 'system',
    input.entity_id ?? null,
    input.goal_id ?? null,
    input.title,
    input.reason ?? '',
    JSON.stringify(input.metadata ?? {}),
    new Date().toISOString(),
  );
  pruneOldLogs();
}

export function getLogs(limit = 100): ActivityLog[] {
  const db = getDb();
  const clamped = Math.min(limit, 200);
  const rows = db.prepare(`
    SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?
  `).all(clamped);
  return (rows as Record<string, unknown>[]).map(parseLog);
}

function pruneOldLogs(): void {
  const db = getDb();
  const settings = db.prepare('SELECT log_retention_days FROM user_settings WHERE id = 1').get() as { log_retention_days: number } | undefined;
  const days = settings?.log_retention_days ?? 3;
  db.prepare(`DELETE FROM activity_logs WHERE timestamp < datetime('now', '-' || ? || ' days')`).run(days);
}
