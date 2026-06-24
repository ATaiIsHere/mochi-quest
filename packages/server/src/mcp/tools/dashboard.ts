import { z } from 'zod';
import { listGoals } from '../../db/queries/goals.js';
import { getActivePlan, getReplanPending } from '../../db/queries/plans.js';
import { getTodayTasks } from '../../db/queries/tasks.js';
import { getWallet } from '../../db/queries/wallet.js';
import { getAllStreaks } from '../../db/queries/streaks.js';
import { getSettings, updateSettings } from '../../db/queries/settings.js';
import { getUserState } from '../../db/queries/assessments.js';
import type { McpTool } from '../server.js';

export const dashboardTools: McpTool[] = [
  {
    name: 'mq_get_dashboard',
    description: 'Get a comprehensive overview: all active goals, today\'s tasks, wallet balance, streaks, and replan status. Call this at the start of each coaching conversation.',
    inputSchema: z.object({}),
    handler: async () => {
      const goals = listGoals('active');
      const todayTasks = getTodayTasks();
      const wallet = getWallet();
      const streaks = getAllStreaks();
      const pendingReplans = getReplanPending();

      const goalSummaries = goals.map(goal => {
        const plan = getActivePlan(goal.id);
        const state = getUserState(goal.id);
        const goalTasks = todayTasks.filter(t => t.goal_id === goal.id);
        const streak = streaks.find(s => s.goal_id === goal.id);

        return {
          ...goal,
          current_level: state?.current_level_description ?? 'Not assessed yet',
          active_plan_phase: plan?.current_phase ?? null,
          replan_pending: plan?.replan_pending ?? false,
          today_tasks: goalTasks,
          today_completed: goalTasks.filter(t => t.status === 'completed').length,
          today_total: goalTasks.length,
          current_streak: streak?.current_streak ?? 0,
        };
      });

      const globalStreak = streaks.find(s => s.goal_id === null);

      return {
        goals: goalSummaries,
        today_progress: {
          completed: todayTasks.filter(t => t.status === 'completed').length,
          total: todayTasks.length,
        },
        wallet: {
          available_coins: wallet.available_coins,
          total_earned: wallet.total_coins,
        },
        global_streak: globalStreak?.current_streak ?? 0,
        pending_replans: pendingReplans.length,
        replan_details: pendingReplans,
      };
    },
  },
  {
    name: 'mq_get_progress_report',
    description: 'Get a detailed progress report for a specific goal.',
    inputSchema: z.object({ goal_id: z.string() }),
    handler: async ({ goal_id }) => {
      const { getGoal } = await import('../../db/queries/goals.js');
      const { getAssessments } = await import('../../db/queries/assessments.js');
      const { getPlanHistory } = await import('../../db/queries/plans.js');
      const { getStreak } = await import('../../db/queries/streaks.js');
      const { getTaskHistory } = await import('../../db/queries/tasks.js');

      const goal = getGoal(goal_id);
      if (!goal) throw new Error(`Goal not found: ${goal_id}`);

      const plan = getActivePlan(goal_id);
      const state = getUserState(goal_id);
      const assessments = getAssessments(goal_id, 5);
      const planHistory = getPlanHistory(goal_id);
      const streak = getStreak(goal_id);
      const recentTasks = getTaskHistory(goal_id, 10);

      return {
        goal,
        current_state: state,
        active_plan: plan,
        plan_version_count: planHistory.length,
        recent_assessments: assessments,
        streak: streak,
        recent_tasks: recentTasks,
      };
    },
  },
  {
    name: 'mq_get_settings',
    description: 'Get global settings (notification time, daily task limit, etc.).',
    inputSchema: z.object({}),
    handler: async () => getSettings(),
  },
  {
    name: 'mq_update_settings',
    description: 'Update global settings.',
    inputSchema: z.object({
      daily_task_total_limit: z.number().min(1).max(20).optional(),
      notification_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:MM format'),
      timezone: z.string().optional(),
    }),
    handler: async (updates) => {
      return updateSettings(updates);
    },
  },
];
