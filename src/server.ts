import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readLatestSnapshot } from './db/snapshot.js';
import { syncAll } from './sync/syncAll.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'onecall',
    version: '1.0.0',
  });

  server.tool(
    'get_work_state',
    "Returns a pre-computed, structured snapshot of the user's current work context — calendar events, email threads requiring action, and tasks by status. Replaces separate calendar, email, and task tool calls. Data is refreshed every 15 minutes in the background.",
    {},
    async () => {
      const snapshot = readLatestSnapshot();
      if (!snapshot) {
        return {
          content: [{ type: 'text', text: 'No snapshot available yet. A sync is running — try again in a moment.' }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }],
      };
    }
  );

  server.tool(
    'trigger_sync',
    'Forces an immediate re-sync of all data sources outside the normal polling interval. Use when the user reports stale data.',
    {},
    async () => {
      syncAll().catch(err => console.error('[trigger_sync] error:', err));
      return {
        content: [{ type: 'text', text: 'Sync triggered. Data will be updated shortly.' }],
      };
    }
  );

  return server;
}
