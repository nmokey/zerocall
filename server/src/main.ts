import './env.js';
import { initSchema } from './db/schema.js';
import { createApiServer } from './api/server.js';

const PORT = parseInt(process.env.PORT ?? '3000');

async function main() {
  initSchema();

  const app = createApiServer();
  app.listen(PORT, () => {
    console.log(`[onecall] running at http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('[onecall] fatal:', err);
  process.exit(1);
});
