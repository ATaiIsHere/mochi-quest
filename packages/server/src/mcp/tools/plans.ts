import { z } from 'zod';
import { createPlan, getActivePlan, getPlanHistory, getReplanPending, setReplanPending } from '../../db/queries/plans.js';
import { triggerReplan } from '../../db/queries/replan.js';
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
    description: `Store an AI-generated plan for a goal. The AI should call this after reasoning through the user's goal, current state, and creating a structured plan.

The plan should include:
- Milestones: major checkpoints with target dates and measurable success criteria
- Task template pool: 7-14 days of pre-planned tasks (mix of daily and optional)
- Tasks should have appropriate difficulty (5-7/10 for daily tasks)
- Coin rewards: difficulty × duration factor (roughly: easy 15min→5, medium 30min→15, hard 60min→30)
- Varied tags to prevent repetitive task sequences`,
    inputSchema: z.object({
      goal_id: z.string(),
      milestones: z.array(MilestoneSchema),
      current_phase: z.string().describe('Current phase name, e.g. "Foundation", "Intermediate"'),
      task_template_pool: z.array(TaskTemplateSchema).describe('Pre-planned tasks for upcoming days (7-14 recommended)'),
      created_reason: z.enum(['initial', 'high_skip_rate', 'low_challenge', 'task_pool_depleted', 'user_request', 'assessment_change']).default('initial'),
    }),
    handler: async (input) => {
      const plan = createPlan(input);
      // Clear replan_pending after generating new plan
      setReplanPending(input.goal_id, false);
      return { plan, message: 'Plan created successfully. Tasks will be allocated to today automatically.' };
    },
  },
  {
    name: 'mq_adjust_plan',
    description: 'Signal that the current plan needs adjustment. This marks the plan as pending replan. The AI should then call mq_generate_plan with an updated plan.',
    inputSchema: z.object({
      goal_id: z.string(),
      reason: z.enum(['high_skip_rate', 'low_challenge', 'task_pool_depleted', 'user_request', 'assessment_change']),
    }),
    handler: async ({ goal_id, reason }) => {
      triggerReplan(goal_id, reason);
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
