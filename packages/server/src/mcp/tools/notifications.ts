import { z } from 'zod';
import { getSettings, updateSettings } from '../../db/queries/settings.js';
import type { McpTool } from '../server.js';

const PORT = process.env.PORT ?? process.env.MOCHI_QUEST_PORT ?? '3030';

export const notificationTools: McpTool[] = [
  {
    name: 'mq_send_notification',
    description: 'Send a notification message to the configured channel (Discord). Use this to alert the user about important events like replan needed, daily summary, or milestone reached.',
    inputSchema: z.object({
      message: z.string().describe('The message to send. Discord supports markdown.'),
    }),
    handler: async ({ message }: { message: string }) => {
      const { discord_webhook_url } = getSettings();
      if (!discord_webhook_url) {
        return { sent: false, reason: 'No notification channel configured. Set discord_webhook_url in settings.' };
      }

      try {
        const res = await fetch(`http://localhost:${PORT}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) return { sent: false, reason: `Server returned ${res.status}` };
        return { sent: true };
      } catch {
        // Fallback: post directly to Discord if REST server isn't running
        try {
          const res = await fetch(discord_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }),
          });
          return { sent: res.ok, reason: res.ok ? undefined : `Discord returned ${res.status}` };
        } catch (err) {
          return { sent: false, reason: String(err) };
        }
      }
    },
  },
  {
    name: 'mq_register_webhook',
    description: `Register this agent's webhook URL to receive server push events.
Call this at agent startup if running an HTTP server that can receive POST requests.
Events are pre-filtered by subscription list and server-side conditions before being sent.
Only needed once (or when the URL changes) — setting is persisted in the database.`,
    inputSchema: z.object({
      webhook_url: z.string().url().describe('The agent webhook endpoint (e.g. http://localhost:8080/webhook)'),
      events: z.array(z.string()).default([
        'task_completed', 'cycle_ended', 'daily_check_ran', 'assessment_recorded',
      ]).describe('Event types to subscribe to. Empty array = all subscribed events (default list applies).'),
    }),
    handler: async ({ webhook_url, events }: { webhook_url: string; events: string[] }) => {
      updateSettings({
        agent_webhook_url: webhook_url,
        agent_webhook_events: events.join(','),
      });
      return { ok: true, message: `Webhook registered: ${webhook_url}, events: ${events.join(', ')}` };
    },
  },
];
