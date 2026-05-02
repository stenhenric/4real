import mongoose from 'mongoose';

import { getEnv } from './env.ts';
import { logger } from '../utils/logger.ts';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

type MongoHelloResponse = {
  setName?: string;
  msg?: string;
  logicalSessionTimeoutMinutes?: number;
};

async function readMongoHello(connection: mongoose.Connection): Promise<MongoHelloResponse> {
  const admin = connection.db?.admin();
  if (!admin) {
    throw new Error('Database admin interface is unavailable');
  }

  try {
    return await admin.command({ hello: 1 }) as MongoHelloResponse;
  } catch {
    return await admin.command({ isMaster: 1 }) as MongoHelloResponse;
  }
}

async function assertMongoTransactionSupport(connection: mongoose.Connection): Promise<void> {
  const hello = await readMongoHello(connection);
  const supportsSessions = typeof hello.logicalSessionTimeoutMinutes === 'number';
  const isReplicaSet = typeof hello.setName === 'string' && hello.setName.length > 0;
  const isShardedCluster = hello.msg === 'isdbgrid';

  if (supportsSessions && (isReplicaSet || isShardedCluster)) {
    return;
  }

  throw new Error(
    'MongoDB transactions require a replica set or sharded cluster with sessions enabled. Configure MONGODB_URI accordingly.',
  );
}

export async function connectDB() {
  const env = getEnv();
  const connection = await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: env.MONGODB_MIN_POOL_SIZE,
    connectTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: env.MONGODB_SOCKET_TIMEOUT_MS,
  });
  await assertMongoTransactionSupport(connection.connection);

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
