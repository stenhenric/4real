import mongoose from 'mongoose';

export function getMongoDb(): mongoose.mongo.Db {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database not connected');
  }

  return db;
}

export function getMongoCollection<TSchema extends object>(name: string): mongoose.mongo.Collection<TSchema> {
  return getMongoDb().collection<TSchema>(name);
}
