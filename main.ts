import { startServer } from './server/runtime.ts';
import { logger } from './server/utils/logger.ts';

startServer().catch((error) => {
  logger.error('server.startup_failed', { error });
  process.exit(1);
});
