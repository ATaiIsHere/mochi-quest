import { z } from 'zod';
import { createGoal, getGoal, listGoals, setGoalStatus, updateGoal } from '../../db/queries/goals.js';
import type { McpTool } from '../server.js';

export const goalTools: McpTool[] = [
  {
    name: 'mq_list_goals',
    description: 'List all personal growth goals. Optionally filter by status (active/paused/completed).',
    inputSchema: z.object({
      status: z.enum(['active', 'paused', 'completed']).optional(),
    }),
    handler: async ({ status }) => {
      const goals = listGoals(status);
      return { goals, count: goals.length };
    },
  },
  {
    name: 'mq_get_goal',
    description: 'Get full details of a specific goal by ID.',
    inputSchema: z.object({
      id: z.string(),
    }),
    handler: async ({ id }) => {
      const goal = getGoal(id);
      if (!goal) throw new Error(`Goal not found: ${id}`);
      return goal;
    },
  },
  {
    name: 'mq_create_goal',
    description: `Create a new personal growth goal. Call this after completing the goal clarification conversation with the user.
The AI should gather:
- Specific success criteria (measurable)
- Deadline (estimate if not given by user)
- Lifestyle context (available time, constraints, tools, preferences)
- Current level/state`,
    inputSchema: z.object({
      title: z.string().describe('Short goal title, e.g. "Learn English to TOEIC 750"'),
      category: z.string().optional().describe('Free-form category tag, e.g. "Language", "Health", "Career"'),
      definition: z.string().optional().describe('Clarified goal definition from conversation'),
      success_criteria: z.string().optional().describe('Measurable success definition'),
      deadline: z.string().optional().describe('Target date in ISO format (YYYY-MM-DD)'),
      lifestyle_context: z.object({
        available_time_per_day: z.string().optional(),
        constraints: z.array(z.string()).optional(),
        available_tools: z.array(z.string()).optional(),
        preferences: z.array(z.string()).optional(),
      }).optional(),
      daily_task_weight: z.number().min(1).max(5).optional().describe('Weight for daily task allocation among multiple goals (1-5, default 3)'),
    }),
    handler: async (input) => {
      return createGoal(input);
    },
  },
  {
    name: 'mq_update_goal',
    description: 'Update goal fields. Use to update definition, success criteria, deadline, or task weight.',
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      category: z.string().optional(),
      definition: z.string().optional(),
      success_criteria: z.string().optional(),
      deadline: z.string().optional(),
      lifestyle_context: z.record(z.unknown()).optional(),
      daily_task_weight: z.number().min(1).max(5).optional(),
    }),
    handler: async ({ id, ...updates }) => {
      const goal = updateGoal(id, updates);
      if (!goal) throw new Error(`Goal not found: ${id}`);
      return goal;
    },
  },
  {
    name: 'mq_complete_goal',
    description: 'Mark a goal as completed. Use when the user has achieved their success criteria.',
    inputSchema: z.object({ id: z.string() }),
    handler: async ({ id }) => setGoalStatus(id, 'completed'),
  },
  {
    name: 'mq_pause_goal',
    description: 'Pause a goal. No tasks will be assigned and streak will not be counted during pause.',
    inputSchema: z.object({ id: z.string() }),
    handler: async ({ id }) => setGoalStatus(id, 'paused'),
  },
  {
    name: 'mq_resume_goal',
    description: 'Resume a paused goal.',
    inputSchema: z.object({ id: z.string() }),
    handler: async ({ id }) => setGoalStatus(id, 'active'),
  },
];
