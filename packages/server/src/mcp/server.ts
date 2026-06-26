import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { goalTools } from './tools/goals.js';
import { planTools } from './tools/plans.js';
import { taskTools } from './tools/tasks.js';
import { rewardTools } from './tools/rewards.js';
import { assessmentTools } from './tools/assessments.js';
import { dashboardTools } from './tools/dashboard.js';
import { notificationTools } from './tools/notifications.js';

export interface McpTool {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: z.ZodObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any) => Promise<unknown>;
}

const ALL_TOOLS = [
  ...goalTools,
  ...planTools,
  ...taskTools,
  ...rewardTools,
  ...assessmentTools,
  ...dashboardTools,
  ...notificationTools,
];

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const zodField = field as z.ZodTypeAny;
    const isOptional = zodField instanceof z.ZodOptional || zodField instanceof z.ZodDefault;
    if (!isOptional) required.push(key);

    const unwrapped = isOptional
      ? (zodField instanceof z.ZodDefault ? zodField._def.innerType : (zodField as z.ZodOptional<z.ZodTypeAny>).unwrap())
      : zodField;

    properties[key] = inferJsonSchemaType(unwrapped, zodField.description);
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

function inferJsonSchemaType(field: z.ZodTypeAny, description?: string): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (description) base.description = description;

  if (field instanceof z.ZodString) return { ...base, type: 'string' };
  if (field instanceof z.ZodNumber) return { ...base, type: 'number' };
  if (field instanceof z.ZodBoolean) return { ...base, type: 'boolean' };
  if (field instanceof z.ZodArray) return { ...base, type: 'array' };
  if (field instanceof z.ZodObject) return { ...base, type: 'object' };
  if (field instanceof z.ZodEnum) return { ...base, type: 'string', enum: field.options };
  if (field instanceof z.ZodOptional) return inferJsonSchemaType(field.unwrap(), description);
  if (field instanceof z.ZodDefault) return inferJsonSchemaType(field._def.innerType, description);
  if (field instanceof z.ZodRecord) return { ...base, type: 'object' };

  return { ...base, type: 'string' };
}

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'mochi-quest', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = ALL_TOOLS.find(t => t.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    try {
      const parsed = tool.inputSchema.parse(request.params.arguments ?? {});
      const result = await tool.handler(parsed as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
