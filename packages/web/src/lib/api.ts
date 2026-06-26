const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Goals ───────────────────────────────────────────────────────────────────

export const api = {
  goals: {
    list: (status?: string) => req<GoalSummary[]>(`/goals${status ? `?status=${status}` : ''}`),
    get: (id: string) => req<Goal>(`/goals/${id}`),
    create: (body: Partial<Goal>) => req<Goal>('/goals', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Goal>) => req<Goal>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    pause: (id: string) => req<Goal>(`/goals/${id}/pause`, { method: 'POST' }),
    resume: (id: string) => req<Goal>(`/goals/${id}/resume`, { method: 'POST' }),
    complete: (id: string) => req<Goal>(`/goals/${id}/complete`, { method: 'POST' }),
    progress: (id: string) => req<ProgressReport>(`/goals/${id}/progress`),
    plan: (id: string) => req<Plan>(`/goals/${id}/plan`),
    planHistory: (id: string) => req<Plan[]>(`/goals/${id}/plan/history`),
    replanStatus: (id: string) => req<{ pending: boolean; reason: string | null }>(`/goals/${id}/plan/replan-status`),
  },
  tasks: {
    today: () => req<Task[]>('/tasks/today'),
    optional: (goalId?: string) => req<Task[]>(`/tasks/optional${goalId ? `?goal_id=${goalId}` : ''}`),
    complete: (id: string, notes?: string) => req<Task>(`/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({ notes }) }),
    skip: (id: string, reason: string) => req<Task>(`/tasks/${id}/skip`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },
  wallet: {
    get: () => req<WalletData>('/wallet'),
    rewards: (status?: string) => req<Reward[]>(`/rewards${status ? `?status=${status}` : ''}`),
    redeem: (id: string) => req<Reward>(`/rewards/${id}/redeem`, { method: 'POST' }),
  },
  streaks: {
    get: () => req<StreaksData>('/streaks'),
  },
  settings: {
    get: () => req<Settings>('/settings'),
    update: (body: Partial<Settings>) => req<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  },
  dashboard: {
    get: () => req<Dashboard>('/dashboard'),
  },
  logs: {
    list: (limit = 100) => req<{ logs: ActivityLog[] }>(`/logs?limit=${limit}`),
  },
};

// ── Types (mirrors server models) ────────────────────────────────────────────

export interface Goal {
  id: string;
  title: string;
  category?: string;
  definition?: string;
  success_criteria?: string;
  deadline?: string;
  daily_task_weight: number;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface GoalSummary extends Goal {
  current_level?: string;
  active_plan_phase?: string | null;
  replan_pending?: boolean;
  today_tasks?: Task[];
  today_completed?: number;
  current_streak?: number;
}

export interface DaySchedule {
  day: number;
  tasks: TaskTemplate[];
}

export interface Plan {
  id: string;
  goal_id: string;
  version: number;
  is_active: boolean;
  milestones: Milestone[];
  current_phase: string;
  task_template_pool: TaskTemplate[];
  cycle_days: number;
  cycle_start_date: string | null;
  daily_schedule: DaySchedule[];
  optional_template_pool: TaskTemplate[];
  replan_pending: boolean;
  created_reason: string;
  created_at: string;
}

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
  task_type: 'daily' | 'optional';
  difficulty: number;
  estimated_duration: string;
  coin_reward: number;
  tags?: string[];
}

export interface Task {
  id: string;
  goal_id: string;
  plan_id?: string;
  title: string;
  description?: string;
  instructions?: string;
  task_type: 'daily' | 'optional';
  difficulty: number;
  estimated_duration?: string;
  due_date?: string;
  coin_reward: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completion_criteria?: string;
  notes?: string;
  created_at: string;
  completed_at?: string;
}

export interface WalletData {
  available_coins: number;
  total_coins: number;
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  amount: number;
  type: 'earn' | 'spend';
  source: string;
  description?: string;
  created_at: string;
}

export interface Reward {
  id: string;
  title: string;
  description?: string;
  coin_cost: number;
  category: string;
  status: 'active' | 'redeemed' | 'archived';
  source: string;
  created_at: string;
}

export interface Streak {
  goal_id: string | null;
  current_streak: number;
  longest_streak: number;
  last_completed_date?: string;
}

export interface StreakMilestone {
  days: number;
  bonus: number;
  claimed?: boolean;
}

export interface StreaksData {
  streaks: Streak[];
  milestones: StreakMilestone[];
}

export interface Settings {
  daily_task_total_limit: number;
  daily_check_time: string;
  discord_webhook_url: string;
  timezone: string;
  log_retention_days: number;
}

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

export interface Dashboard {
  goals: GoalSummary[];
  today_progress: { completed: number; total: number };
  wallet: { available_coins: number; total_earned: number };
  global_streak: number;
  pending_replans: number;
}

export interface ProgressReport {
  goal: Goal;
  current_state?: { current_level_description: string; strengths: string[]; weaknesses: string[] };
  active_plan?: Plan;
  recent_assessments: Assessment[];
  streak?: Streak;
  recent_tasks: Task[];
}

export interface Assessment {
  id: string;
  goal_id: string;
  assessment_type: string;
  result: Record<string, unknown>;
  source: string;
  notes?: string;
  created_at?: string;
  timestamp?: string;
}
