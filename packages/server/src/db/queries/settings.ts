import { getDb } from '../schema.js';

export interface UserSettings {
  daily_task_total_limit: number;
  daily_check_time: string;
  discord_webhook_url: string;
  timezone: string;
  llm_provider: Record<string, unknown> | null;
  log_retention_days: number;
  agent_webhook_url: string;
  agent_webhook_events: string;
}

export function getSettings(): UserSettings {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_settings WHERE id = 1').get() as Record<string, unknown>;
  return {
    daily_task_total_limit: row.daily_task_total_limit as number,
    daily_check_time: (row.daily_check_time as string) || '04:00',
    discord_webhook_url: (row.discord_webhook_url as string) || '',
    timezone: row.timezone as string,
    llm_provider: row.llm_provider ? JSON.parse(row.llm_provider as string) : null,
    log_retention_days: row.log_retention_days as number,
    agent_webhook_url: (row.agent_webhook_url as string) || '',
    agent_webhook_events: (row.agent_webhook_events as string) || 'task_completed,cycle_ended,daily_check_ran,assessment_recorded',
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
  if (updates.daily_check_time !== undefined) {
    fields.push('daily_check_time = ?');
    values.push(updates.daily_check_time);
  }
  if (updates.discord_webhook_url !== undefined) {
    fields.push('discord_webhook_url = ?');
    values.push(updates.discord_webhook_url);
  }
  if (updates.timezone !== undefined) {
    fields.push('timezone = ?');
    values.push(updates.timezone);
  }
  if (updates.llm_provider !== undefined) {
    fields.push('llm_provider = ?');
    values.push(updates.llm_provider ? JSON.stringify(updates.llm_provider) : null);
  }
  if (updates.log_retention_days !== undefined) {
    fields.push('log_retention_days = ?');
    values.push(Math.max(1, Math.min(30, updates.log_retention_days)));
  }
  if (updates.agent_webhook_url !== undefined) {
    fields.push('agent_webhook_url = ?');
    values.push(updates.agent_webhook_url);
  }
  if (updates.agent_webhook_events !== undefined) {
    fields.push('agent_webhook_events = ?');
    values.push(updates.agent_webhook_events);
  }

  if (fields.length > 0) {
    db.prepare(`UPDATE user_settings SET ${fields.join(', ')} WHERE id = 1`).run(...values);
  }

  return getSettings();
}
