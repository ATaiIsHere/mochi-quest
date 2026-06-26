import { z } from 'zod';
import { getSettings } from '../../db/queries/settings.js';
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
];
