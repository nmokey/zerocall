import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initSchema } from './db/schema.js';
import { startScheduler } from './sync/scheduler.js';
import { createServer } from './server.js';

async function main() {
  initSchema();
  startScheduler();

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('[onecall] fatal:', err);
  process.exit(1);
});
