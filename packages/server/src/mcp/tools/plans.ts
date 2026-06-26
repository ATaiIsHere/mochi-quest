import { z } from 'zod';
import { createPlan, getActivePlan, getPlanHistory, getReplanPending, setReplanPending, type TaskTemplate } from '../../db/queries/plans.js';
import { triggerReplan, type TriggerReason } from '../../db/queries/replan.js';
import type { McpTool } from '../server.js';

const MilestoneSchema = z.object({
  title: z.string(),
  description: z.string(),
  target_date: z.string(),
  success_criteria: z.string(),
  is_completed: z.boolean().default(false),
  completed_at: z.string().optional(),
});

const TaskTemplateSchema = z.object({
  title: z.string(),
  description: z.string(),
  instructions: z.string(),
  task_type: z.enum(['daily', 'optional']),
  difficulty: z.number().min(1).max(10),
  estimated_duration: z.string(),
  coin_reward: z.number().positive(),
  completion_criteria: z.string(),
  completion_method: z.enum(['manual', 'auto']).default('manual'),
  tags: z.array(z.string()).default([]),
});

export const planTools: McpTool[] = [
  {
    name: 'mq_get_plan',
    description: 'Get the active plan for a goal, including milestones and upcoming task preview.',
    inputSchema: z.object({ goal_id: z.string() }),
    handler: async ({ goal_id }) => {
      const plan = getActivePlan(goal_id);
      if (!plan) return { plan: null, message: 'No active plan. Call mq_generate_plan to create one.' };
      return plan;
    },
  },
  {
    name: 'mq_generate_plan',
    description: `Store an AI-generated cycle-based plan for a goal.

The plan uses a cycle model:
- AI decides \`cycle_days\` (recommended 7–14 days, avoid too long in case the plan isn't working)
- \`daily_schedule\`: an array of day entries, each with a list of tasks for that day
  - Same habit tasks (e.g. "weigh yourself") can appear in multiple days
  - Each day should have 1-3 focused tasks
  - No need to fill all cycle_days — days without an entry get no tasks
- \`optional_pool\`: tasks available throughout the cycle (created once, user picks any)
  - Used to detect "too easy" (all optional done = early replan)
- Milestones: major checkpoints with target dates
- Difficulty 5-7/10 for daily tasks; coin rewards: ~5 per 15min of effort
- Clear \`created_reason\` to explain why this plan was created`,
    inputSchema: z.object({
      goal_id: z.string(),
      milestones: z.array(MilestoneSchema),
      current_phase: z.string().describe('Current phase name, e.g. "Foundation", "Intermediate"'),
      cycle_days: z.number().int().min(1).max(30).default(7).describe('Length of this plan cycle in days'),
      daily_schedule: z.array(z.object({
        day: z.number().int().min(1).describe('Day number within the cycle (1-indexed)'),
        tasks: z.array(TaskTemplateSchema.omit({ task_type: true })).describe('Tasks for this day'),
      })).describe('Day-by-day task schedule for the cycle'),
      optional_pool: z.array(TaskTemplateSchema.omit({ task_type: true })).default([]).describe('Optional tasks available throughout the entire cycle'),
      created_reason: z.enum([
        'initial', 'high_skip_rate', 'low_challenge', 'task_pool_depleted',
        'user_request', 'assessment_change', 'cycle_complete', 'low_completion', 'high_optional_completion',
      ] as const).default('initial'),
    }),
    handler: async (input) => {
      const plan = createPlan({
        goal_id: input.goal_id,
        milestones: input.milestones,
        current_phase: input.current_phase,
        cycle_days: input.cycle_days,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        daily_schedule: (input.daily_schedule as any[]).map((d: any) => ({
          day: d.day as number,
          tasks: (d.tasks as any[]).map((t: any) => ({ ...t, task_type: 'daily' as const }) as TaskTemplate),
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        optional_template_pool: (input.optional_pool as any[]).map((t: any) => ({ ...t, task_type: 'optional' as const }) as TaskTemplate),
        created_reason: input.created_reason,
      });
      // Clear replan_pending after generating new plan
      setReplanPending(input.goal_id, false);
      return { plan, message: `Cycle-based plan created (${input.cycle_days} days). Today's tasks will be allocated automatically on first request.` };
    },
  },
  {
    name: 'mq_adjust_plan',
    description: 'Signal that the current plan needs adjustment. This marks the plan as pending replan. The AI should then call mq_generate_plan with an updated plan.',
    inputSchema: z.object({
      goal_id: z.string(),
      reason: z.enum([
        'high_skip_rate', 'low_challenge', 'task_pool_depleted',
        'user_request', 'assessment_change', 'cycle_complete', 'low_completion', 'high_optional_completion',
      ] as const),
    }),
    handler: async ({ goal_id, reason }) => {
      triggerReplan(goal_id, reason as TriggerReason);
      return { message: 'Replan triggered. Please call mq_generate_plan with the updated plan.' };
    },
  },
  {
    name: 'mq_get_replan_status',
    description: 'Check if any goals have a pending replan. Call this at the start of each conversation to check if AI action is needed.',
    inputSchema: z.object({
      goal_id: z.string().optional(),
    }),
    handler: async ({ goal_id }) => {
      const pending = getReplanPending();
      if (goal_id) {
        const found = pending.find(p => p.goal_id === goal_id);
        return { pending: !!found, reason: found?.created_reason ?? null };
      }
      return { pending_goals: pending, has_pending: pending.length > 0 };
    },
  },
  {
    name: 'mq_get_plan_history',
    description: 'Get all historical versions of plans for a goal. Useful for showing the user how their plan has evolved.',
    inputSchema: z.object({ goal_id: z.string() }),
    handler: async ({ goal_id }) => {
      return { history: getPlanHistory(goal_id) };
    },
  },
];
