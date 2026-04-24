import mongoose from 'mongoose';

import { getEnv } from './env.ts';
import { logger } from '../utils/logger.ts';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

export async function connectDB() {
  const { MONGODB_URI } = getEnv();
  const connection = await mongoose.connect(MONGODB_URI);

  logger.info('database.connected', {
    host: connection.connection.host,
    name: connection.connection.name,
  });

  return connection;
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger.info('database.disconnected');
}

export default connectDB;
