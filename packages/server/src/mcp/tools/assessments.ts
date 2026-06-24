import { z } from 'zod';
import { addAssessment, getAssessments, getUserState, updateUserState } from '../../db/queries/assessments.js';
import type { McpTool } from '../server.js';

export const assessmentTools: McpTool[] = [
  {
    name: 'mq_add_assessment',
    description: `Record a new assessment of the user's current state for a goal.
Assessment types are free-form strings, e.g.:
- "toeic_mock_score" → result: { score: 620, date: "2026-06-24" }
- "weight_kg" → result: { weight: 75.5, body_fat_pct: 22 }
- "leetcode_rate" → result: { easy: 0.8, medium: 0.4, hard: 0.1 }
- "self_report" → result: { feeling: "improving", notes: "..." }
Adding an assessment automatically triggers a replan check.`,
    inputSchema: z.object({
      goal_id: z.string(),
      assessment_type: z.string().describe('Free-form type identifier'),
      result: z.record(z.unknown()).describe('Assessment results as key-value pairs'),
      source: z.enum(['user_report', 'integration', 'ai_inference']),
      notes: z.string().optional(),
    }),
    handler: async (input) => {
      return addAssessment(input);
    },
  },
  {
    name: 'mq_get_assessments',
    description: 'Get assessment history for a goal.',
    inputSchema: z.object({
      goal_id: z.string(),
      limit: z.number().optional().default(10),
    }),
    handler: async ({ goal_id, limit }) => {
      return { assessments: getAssessments(goal_id, limit) };
    },
  },
  {
    name: 'mq_get_user_state',
    description: 'Get the current state of the user for a specific goal (level description, strengths, weaknesses).',
    inputSchema: z.object({ goal_id: z.string() }),
    handler: async ({ goal_id }) => {
      const state = getUserState(goal_id);
      return state ?? { goal_id, current_level_description: 'No state recorded yet.', strengths: [], weaknesses: [] };
    },
  },
  {
    name: 'mq_update_user_state',
    description: `Update the user's state for a goal after assessing their progress.
Call this when you have enough information to characterize the user's current level.
This should be called:
- After onboarding conversation
- After reviewing assessment results
- After a significant change in progress`,
    inputSchema: z.object({
      goal_id: z.string(),
      current_level_description: z.string().optional().describe('Natural language description + quantified metrics'),
      strengths: z.array(z.string()).optional(),
      weaknesses: z.array(z.string()).optional(),
      integration_configs: z.record(z.unknown()).optional(),
    }),
    handler: async ({ goal_id, ...updates }) => {
      return updateUserState(goal_id, updates);
    },
  },
];
