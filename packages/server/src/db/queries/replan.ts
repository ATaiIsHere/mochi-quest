import { getDb } from '../schema.js';
import { getSkipRateLast3Days, getOptionalCompletionRateLast3Days } from './tasks.js';
import { getActivePlan, setReplanPending } from './plans.js';
import { writeLog } from './logs.js';

const SKIP_RATE_THRESHOLD = 0.5;
const OPTIONAL_COMPLETION_THRESHOLD = 0.8;
const POOL_DAYS_THRESHOLD = 3;

type TriggerReason = 'high_skip_rate' | 'low_challenge' | 'task_pool_depleted' | 'user_request' | 'assessment_change' | 'task_completed' | 'task_skipped';

export function checkAndTriggerReplan(goalId: string, event: TriggerReason): void {
  const plan = getActivePlan(goalId);
  if (!plan || plan.replan_pending) return;

  let shouldReplan = false;
  let reason: TriggerReason = event;

  if (event === ('task_skipped' as TriggerReason)) {
    const skipRate = getSkipRateLast3Days(goalId);
    if (skipRate > SKIP_RATE_THRESHOLD) {
      shouldReplan = true;
      reason = 'high_skip_rate';
    }
  }

  if (event === 'task_completed') {
    // Check optional completion rate
    const optionalRate = getOptionalCompletionRateLast3Days(goalId);
    if (optionalRate > OPTIONAL_COMPLETION_THRESHOLD) {
      shouldReplan = true;
      reason = 'low_challenge';
    }

    // Check task pool
    const dailyPool = plan.task_template_pool.filter(t => t.task_type === 'daily');
    if (dailyPool.length < POOL_DAYS_THRESHOLD) {
      shouldReplan = true;
      reason = 'task_pool_depleted';
    }
  }

  if (event === 'user_request' || event === 'assessment_change') {
    shouldReplan = true;
    reason = event;
  }

  if (shouldReplan) {
    triggerReplan(goalId, reason);
  }
}

export function triggerReplan(goalId: string, reason: TriggerReason): void {
  const db = getDb();
  db.prepare('UPDATE plans SET replan_pending = 1, created_reason = ? WHERE goal_id = ? AND is_active = 1').run(reason, goalId);
  writeLog({ event_type: 'replan_triggered', goal_id: goalId, title: '觸發重新規劃', reason });
  // Emit SSE event for UI to show "AI is re-planning..." badge
  emitSseEvent('replan_pending', { goal_id: goalId, reason });
}

// SSE event emitter (in-memory, subscribers set up by API server)
type SseEvent = { type: string; data: Record<string, unknown> };
const sseSubscribers = new Set<(event: SseEvent) => void>();

export function subscribeToSse(handler: (event: SseEvent) => void): () => void {
  sseSubscribers.add(handler);
  return () => sseSubscribers.delete(handler);
}

export function emitSseEvent(type: string, data: Record<string, unknown>): void {
  for (const handler of sseSubscribers) {
    try {
      handler({ type, data });
    } catch {
      // ignore
    }
  }
}
