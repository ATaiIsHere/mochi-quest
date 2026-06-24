import { z } from 'zod';
import { completeTask, createTask, getOptionalTasks, getTask, getTodayTasks, getTaskHistory, skipTask } from '../../db/queries/tasks.js';
import { getActivePlan } from '../../db/queries/plans.js';
import type { McpTool } from '../server.js';

export const taskTools: McpTool[] = [
  {
    name: 'mq_get_today_tasks',
    description: `Get today's daily tasks for all active goals. Tasks are allocated from the plan's task template pool using the multi-goal balancing algorithm.
If no tasks exist yet for today, they are allocated automatically (no LLM needed).`,
    inputSchema: z.object({}),
    handler: async () => {
      const tasks = getTodayTasks();
      return { tasks, count: tasks.length };
    },
  },
  {
    name: 'mq_get_optional_tasks',
    description: 'Get the optional task pool (supplementary tasks for motivated days). Pool maintains 3-5 tasks.',
    inputSchema: z.object({
      goal_id: z.string().optional(),
    }),
    handler: async ({ goal_id }) => {
      const tasks = getOptionalTasks(goal_id);
      return { tasks, count: tasks.length };
    },
  },
  {
    name: 'mq_create_task',
    description: `Create a new task and add it to a goal's task list.
Use this to:
- Add optional tasks to the pool after user completes one (auto-replenish)
- Insert a one-off replacement task when user reports schedule conflict
Do NOT use this for bulk plan generation — use mq_generate_plan's task_template_pool instead.`,
    inputSchema: z.object({
      goal_id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      instructions: z.string().optional(),
      task_type: z.enum(['daily', 'optional']).default('optional'),
      difficulty: z.number().min(1).max(10).optional(),
      estimated_duration: z.string().optional(),
      due_date: z.string().optional().describe('ISO date (YYYY-MM-DD), only for daily tasks'),
      coin_reward: z.number().positive().optional(),
      completion_criteria: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    handler: async ({ goal_id, ...taskData }) => {
      const plan = getActivePlan(goal_id);
      if (!plan) throw new Error(`No active plan for goal ${goal_id}. Create a plan first.`);
      return createTask({ ...taskData, plan_id: plan.id, goal_id });
    },
  },
  {
    name: 'mq_complete_task',
    description: 'Mark a task as completed. Automatically awards coins, updates streak, and checks if replan is needed.',
    inputSchema: z.object({
      id: z.string(),
      notes: z.string().optional().describe('Optional notes on how the task went'),
    }),
    handler: async ({ id, notes }) => {
      const task = completeTask(id, notes);
      if (!task) throw new Error(`Task not found: ${id}`);
      return {
        task,
        message: `Great job! Earned ${task.coin_reward} coins for completing "${task.title}"`,
      };
    },
  },
  {
    name: 'mq_skip_task',
    description: `Skip a task and record the reason. For daily tasks, this may break the streak.
After skipping, the system automatically checks if the skip rate is too high (>50% over 3 days) and triggers a replan if needed.`,
    inputSchema: z.object({
      id: z.string(),
      reason: z.string().describe('Why the task is being skipped'),
    }),
    handler: async ({ id, reason }) => {
      const task = skipTask(id, reason);
      if (!task) throw new Error(`Task not found: ${id}`);
      return {
        task,
        message: task.task_type === 'daily'
          ? 'Daily task skipped. Streak may be affected. The system will check if the plan needs adjustment.'
          : 'Optional task skipped.',
      };
    },
  },
  {
    name: 'mq_get_task',
    description: 'Get details of a specific task.',
    inputSchema: z.object({ id: z.string() }),
    handler: async ({ id }) => {
      const task = getTask(id);
      if (!task) throw new Error(`Task not found: ${id}`);
      return task;
    },
  },
  {
    name: 'mq_get_task_history',
    description: 'Get recent completed/skipped tasks for a goal.',
    inputSchema: z.object({
      goal_id: z.string(),
      limit: z.number().optional().default(20),
    }),
    handler: async ({ goal_id, limit }) => {
      return { tasks: getTaskHistory(goal_id, limit) };
    },
  },
];
