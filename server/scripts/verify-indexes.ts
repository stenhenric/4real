import connectDB, { disconnectDB } from '../config/db.ts';
import { setupIndexes } from '../lib/setup-db.ts';
import { logger } from '../utils/logger.ts';

async function main() {
  await connectDB();
  try {
    await setupIndexes();
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  logger.error('database.index_verification_failed', { error });
  process.exit(1);
});
