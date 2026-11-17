// Runs a Next.js command (dev | start) on the port from config (WEB_PORT in .env).
// Usage: tsx scripts/next.ts dev
import { spawn } from 'node:child_process';
import { config } from '@sta/shared';

const command = process.argv[2] ?? 'dev';
const child = spawn('next', [command, '--port', String(config.app.webPort)], {
  stdio: 'inherit',
  shell: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
