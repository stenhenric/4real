import { getEnv } from './env.ts';

export const getJwtSecret = (): string => getEnv().JWT_SECRET;
