import { getDb } from '../schema.js';

export interface UserSettings {
  daily_task_total_limit: number;
  notification_time: string;
  timezone: string;
  llm_provider: Record<string, unknown> | null;
}

export function getSettings(): UserSettings {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_settings WHERE id = 1').get() as Record<string, unknown>;
  return {
    daily_task_total_limit: row.daily_task_total_limit as number,
    notification_time: row.notification_time as string,
    timezone: row.timezone as string,
    llm_provider: row.llm_provider ? JSON.parse(row.llm_provider as string) : null,
  };
}

export function updateSettings(updates: Partial<UserSettings>): UserSettings {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.daily_task_total_limit !== undefined) {
    fields.push('daily_task_total_limit = ?');
    values.push(updates.daily_task_total_limit);
  }
  if (updates.notification_time !== undefined) {
    fields.push('notification_time = ?');
    values.push(updates.notification_time);
  }
  if (updates.timezone !== undefined) {
    fields.push('timezone = ?');
    values.push(updates.timezone);
  }
  if (updates.llm_provider !== undefined) {
    fields.push('llm_provider = ?');
    values.push(updates.llm_provider ? JSON.stringify(updates.llm_provider) : null);
  }

  if (fields.length > 0) {
    db.prepare(`UPDATE user_settings SET ${fields.join(', ')} WHERE id = 1`).run(...values);
  }

  return getSettings();
}
