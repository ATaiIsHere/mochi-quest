#!/usr/bin/env node
import { startMcpServer } from './mcp/server.js';
import { startApiServer } from './api/server.js';
import { startScheduler } from './scheduler.js';

const command = process.argv[2] ?? 'start';
const flags = process.argv.slice(3);

switch (command) {
  case 'mcp':
    // MCP-only mode (for agent connections)
    await startMcpServer();
    break;

  case 'start': {
    const isDaemon = flags.includes('--daemon');
    if (isDaemon) {
      console.log('Starting Mochi Quest in daemon mode...');
    }
    startApiServer();
    startScheduler();
    await startMcpServer();
    break;
  }

  case 'daily-check':
    // Lightweight daily check — no LLM, pure DB
    await (await import('./scheduler.js')).runSystemCheck();
    break;

  case 'setup':
    await runSetup();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    console.log('Usage: mochi-quest [start|mcp|daily-check|setup] [--daemon]');
    process.exit(1);
}


async function runSetup(): Promise<void> {
  const os = await import('node:os');
  const platform = os.platform();
  console.log(`Setting up Mochi Quest for ${platform}...`);
  console.log('TODO: Install auto-start for your platform:');
  console.log('  macOS:   ~/Library/LaunchAgents/com.mochi-quest.plist');
  console.log('  Linux:   ~/.config/systemd/user/mochi-quest.service');
  console.log('  Windows: Startup folder');
  console.log('\nFor now, add this to your shell profile to start manually:');
  console.log('  alias mq="npx mochi-quest start --daemon"');
}
