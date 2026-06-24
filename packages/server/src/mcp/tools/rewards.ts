import { z } from 'zod';
import { createReward, getReward, listRewards, redeemReward } from '../../db/queries/rewards.js';
import { getWallet, getTransactions } from '../../db/queries/wallet.js';
import { getAllStreaks, getStreakMilestones } from '../../db/queries/streaks.js';
import type { McpTool } from '../server.js';

export const rewardTools: McpTool[] = [
  {
    name: 'mq_get_wallet',
    description: 'Get the user\'s coin balance and recent transaction history.',
    inputSchema: z.object({
      transaction_limit: z.number().optional().default(10),
    }),
    handler: async ({ transaction_limit }) => {
      return {
        wallet: getWallet(),
        recent_transactions: getTransactions(transaction_limit),
      };
    },
  },
  {
    name: 'mq_list_rewards',
    description: 'List all rewards.',
    inputSchema: z.object({
      status: z.enum(['active', 'redeemed', 'archived']).optional(),
    }),
    handler: async ({ status }) => {
      return { rewards: listRewards(status) };
    },
  },
  {
    name: 'mq_create_reward',
    description: `Create a new reward that the user can redeem with coins.
After creating, you should call mq_review_reward_pricing to check if the cost is appropriate given the user's goals.`,
    inputSchema: z.object({
      title: z.string(),
      description: z.string().optional(),
      coin_cost: z.number().positive(),
      category: z.enum(['food', 'leisure', 'purchase', 'experience', 'custom']).default('custom'),
      source: z.enum(['user_defined', 'ai_suggested']).default('user_defined'),
    }),
    handler: async (input) => {
      return createReward(input);
    },
  },
  {
    name: 'mq_review_reward_pricing',
    description: `Review and potentially adjust a reward's pricing based on goal conflicts.
Call this after creating a reward, especially food/leisure rewards when the user has health-related goals.
The AI should:
1. Fetch active goals (mq_list_goals)
2. Assess if this reward conflicts with any goal
3. If significant conflict exists, suggest a higher coin cost (1.5-3x)
4. Store the impact assessment on the reward`,
    inputSchema: z.object({
      reward_id: z.string(),
      goal_impacts: z.array(z.object({
        goal_id: z.string(),
        impact_level: z.enum(['none', 'minor', 'significant']),
        reason: z.string(),
      })),
      suggested_cost_multiplier: z.number().optional().describe('1.0 = no change, 1.5-3.0 = increase cost due to goal conflict'),
    }),
    handler: async ({ reward_id, goal_impacts, suggested_cost_multiplier }) => {
      const { updateRewardGoalImpact } = await import('../../db/queries/rewards.js');
      updateRewardGoalImpact(reward_id, goal_impacts, suggested_cost_multiplier);
      const reward = getReward(reward_id);
      if (suggested_cost_multiplier && suggested_cost_multiplier > 1.0) {
        const adjustedCost = Math.round(reward!.coin_cost * suggested_cost_multiplier);
        return {
          reward,
          message: `Pricing reviewed. Due to goal conflict, suggested cost is ${adjustedCost} coins (${suggested_cost_multiplier}x multiplier). Update the reward if you agree.`,
          adjusted_cost_suggestion: adjustedCost,
        };
      }
      return { reward, message: 'Pricing reviewed. No adjustment needed.' };
    },
  },
  {
    name: 'mq_suggest_rewards',
    description: 'AI should call this to record AI-suggested rewards based on user preferences.',
    inputSchema: z.object({
      suggestions: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        coin_cost: z.number().positive(),
        category: z.enum(['food', 'leisure', 'purchase', 'experience', 'custom']),
      })),
    }),
    handler: async ({ suggestions }) => {
      const created = (suggestions as Array<{ title: string; description?: string; coin_cost: number; category: 'food' | 'leisure' | 'purchase' | 'experience' | 'custom' }>).map(s => createReward({ ...s, source: 'ai_suggested' }));
      return { created_rewards: created };
    },
  },
  {
    name: 'mq_redeem_reward',
    description: 'Redeem a reward by spending coins.',
    inputSchema: z.object({ id: z.string() }),
    handler: async ({ id }) => {
      return redeemReward(id);
    },
  },
  {
    name: 'mq_get_streak',
    description: 'Get streak information. If goal_id is omitted, returns the global streak (all goals completed).',
    inputSchema: z.object({
      goal_id: z.string().optional(),
    }),
    handler: async ({ goal_id }) => {
      const { getStreak } = await import('../../db/queries/streaks.js');
      return goal_id !== undefined
        ? { streak: getStreak(goal_id) }
        : { global_streak: getStreak(), all_streaks: getAllStreaks() };
    },
  },
  {
    name: 'mq_get_streak_milestones',
    description: 'Get streak milestone rewards (7/30/100/365 days with bonus coins).',
    inputSchema: z.object({}),
    handler: async () => {
      return { milestones: getStreakMilestones() };
    },
  },
];
