import Database from 'better-sqlite3';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';

const DB_PATH = resolve(
  process.env.MOCHI_QUEST_DB
    ?? join(process.env.MOCHI_QUEST_DATA_DIR ?? join(homedir(), '.mochi-quest'), 'data.db'),
);
const DB_DIR = dirname(DB_PATH);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const current = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }).v ?? 0;

  const migrations: Array<{ version: number; sql: string }> = [
    { version: 1, sql: MIGRATION_1 },
    { version: 2, sql: MIGRATION_2 },
  ];

  for (const m of migrations) {
    if (m.version > current) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
    }
  }
}

const MIGRATION_1 = `
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    definition TEXT NOT NULL DEFAULT '',
    success_criteria TEXT NOT NULL DEFAULT '',
    deadline TEXT,
    lifestyle_context TEXT NOT NULL DEFAULT '{}',
    daily_task_weight INTEGER NOT NULL DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    milestones TEXT NOT NULL DEFAULT '[]',
    current_phase TEXT NOT NULL DEFAULT '',
    task_template_pool TEXT NOT NULL DEFAULT '[]',
    replan_pending INTEGER NOT NULL DEFAULT 0 CHECK (replan_pending IN (0, 1)),
    created_reason TEXT NOT NULL DEFAULT 'initial',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_plans_goal_active ON plans(goal_id, is_active);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    task_type TEXT NOT NULL DEFAULT 'daily' CHECK (task_type IN ('daily', 'optional')),
    difficulty INTEGER NOT NULL DEFAULT 5 CHECK (difficulty BETWEEN 1 AND 10),
    estimated_duration TEXT NOT NULL DEFAULT '30 minutes',
    due_date TEXT,
    coin_reward INTEGER NOT NULL DEFAULT 10,
    completion_criteria TEXT NOT NULL DEFAULT '',
    completion_method TEXT NOT NULL DEFAULT 'manual' CHECK (completion_method IN ('manual', 'auto')),
    tags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status);

  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    assessment_type TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'user_report' CHECK (source IN ('user_report', 'integration', 'ai_inference')),
    notes TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_assessments_goal ON assessments(goal_id, timestamp);

  CREATE TABLE IF NOT EXISTS user_states (
    goal_id TEXT PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE,
    current_level_description TEXT NOT NULL DEFAULT '',
    strengths TEXT NOT NULL DEFAULT '[]',
    weaknesses TEXT NOT NULL DEFAULT '[]',
    integration_configs TEXT NOT NULL DEFAULT '{}',
    last_assessment_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_wallet (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_coins INTEGER NOT NULL DEFAULT 0,
    available_coins INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO user_wallet (id, total_coins, available_coins) VALUES (1, 0, 0);

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('earned', 'spent', 'milestone_bonus')),
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    source_id TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    coin_cost INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'custom' CHECK (category IN ('food', 'leisure', 'purchase', 'experience', 'custom')),
    goal_impact TEXT NOT NULL DEFAULT '[]',
    suggested_cost_multiplier REAL,
    source TEXT NOT NULL DEFAULT 'user_defined' CHECK (source IN ('user_defined', 'ai_suggested')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'archived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS streaks (
    id TEXT PRIMARY KEY,
    goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_completed_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_streaks_goal ON streaks(goal_id);

  INSERT OR IGNORE INTO streaks (id, goal_id) VALUES ('global', NULL);

  CREATE TABLE IF NOT EXISTS streak_milestone_claims (
    id TEXT PRIMARY KEY,
    goal_id TEXT,
    days INTEGER NOT NULL,
    bonus_coins INTEGER NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    daily_task_total_limit INTEGER NOT NULL DEFAULT 5,
    notification_time TEXT NOT NULL DEFAULT '08:00',
    timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
    llm_provider TEXT
  );

  INSERT OR IGNORE INTO user_settings (id) VALUES (1);
`;

const MIGRATION_2 = `
  ALTER TABLE user_settings ADD COLUMN log_retention_days INTEGER NOT NULL DEFAULT 3;

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'system',
    entity_id TEXT,
    goal_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON activity_logs(timestamp DESC);
`;
