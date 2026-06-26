import { getSettings } from '../db/queries/settings.js';

// Server-side pre-filter conditions per event type.
// Only events passing their condition (or with no condition defined) get POSTed to the agent webhook.
// This saves agent tokens by not forwarding every task_completed or daily_check_ran.
const WEBHOOK_CONDITIONS: Partial<Record<string, (m: Record<string, unknown>) => boolean>> = {
  task_completed: (m) => (m.optional_completion_rate as number) === 1.0,
  daily_check_ran: (m) =>
    (m.per_goal as Array<{ skip_rate_3d: number }>).some(g => g.skip_rate_3d > 0.5),
};

export async function notifyAgentWebhook(
  type: string,
  data: { goal_id?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const { agent_webhook_url, agent_webhook_events } = getSettings();
  if (!agent_webhook_url) return;

  // Event type subscription filter
  const subscribed = agent_webhook_events.split(',').map(s => s.trim()).filter(Boolean);
  if (subscribed.length > 0 && !subscribed.includes(type)) return;

  // Server-side condition pre-filter
  const condition = WEBHOOK_CONDITIONS[type];
  if (condition && !condition(data.metadata ?? {})) return;

  await fetch(agent_webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: type, ...data, timestamp: new Date().toISOString() }),
  }).catch(err => console.error(`[webhook] ${type} failed:`, err));
}

export async function sendDiscordNotification(message: string): Promise<void> {
  const { discord_webhook_url } = getSettings();
  if (!discord_webhook_url) {
    console.warn('[notify] No discord_webhook_url configured — notification skipped');
    return;
  }

  const res = await fetch(discord_webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });

  if (!res.ok) {
    console.error(`[notify] Discord webhook returned ${res.status}`);
    throw new Error(`Discord returned ${res.status}`);
  }
}
