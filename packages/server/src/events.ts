import { writeLog } from './db/queries/logs.js';
import { emitSseEvent } from './db/queries/replan.js';
import { notifyAgentWebhook } from './api/notify.js';

export function emitEvent(
  type: string,
  data: {
    goal_id?: string;
    entity_type?: string;
    entity_id?: string;
    title: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  writeLog({ event_type: type, ...data });
  emitSseEvent(type, { goal_id: data.goal_id, ...data.metadata });
  notifyAgentWebhook(type, data).catch(() => {});
}
