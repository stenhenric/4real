import { Queue, Worker, type JobsOptions } from 'bullmq';

import { getEnv } from '../config/env.ts';
import { getRedisClient } from './redis.service.ts';
import { registerMetricsCollector, setBullmqQueueDepth } from './metrics.service.ts';
import { logger } from '../utils/logger.ts';

interface BullmqJobDefinition {
  queueName: string;
  jobName: string;
  repeatEveryMs: number;
  processor: () => Promise<void>;
}

export interface BullmqBackgroundJobRuntime {
  stop: () => Promise<void>;
  probe: () => Promise<void>;
  getQueueDepths: () => Promise<Record<string, number>>;
}

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1_000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};
let activeBullmqRuntime: BullmqBackgroundJobRuntime | null = null;

registerMetricsCollector('bullmq_queue_depth', async () => {
  const queueDepths = await activeBullmqRuntime?.getQueueDepths();
  if (!queueDepths) {
    return;
  }

  for (const [queue, depth] of Object.entries(queueDepths)) {
    setBullmqQueueDepth(queue, depth);
  }
});

async function enqueueDlqEntry(
  dlqQueue: Queue<Record<string, unknown>>,
  definition: BullmqJobDefinition,
  failureMessage: string,
  attemptsMade: number,
): Promise<void> {
  const jobId = `${definition.jobName}:${Date.now()}`;
  await dlqQueue.add(
    `${definition.jobName}-dlq`,
    {
      queueName: definition.queueName,
      jobName: definition.jobName,
      attemptsMade,
      failureMessage,
    },
    {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
}

function readAttemptLimit(job: { opts: { attempts?: number } }): number {
  return job.opts.attempts ?? defaultJobOptions.attempts ?? 1;
}

export async function startBullmqBackgroundJobs(
  definitions: BullmqJobDefinition[],
): Promise<BullmqBackgroundJobRuntime> {
  const redis = getRedisClient();
  const queues: Queue<Record<string, unknown>>[] = [];
  const dlqQueues: Queue<Record<string, unknown>>[] = [];
  const workers: Worker<Record<string, unknown>>[] = [];
  const workerConnections: Array<ReturnType<typeof getRedisClient>> = [];

  for (const definition of definitions) {
    const queue = new Queue<Record<string, unknown>>(definition.queueName, {
      connection: redis,
      defaultJobOptions,
    });
    const dlqQueue = new Queue<Record<string, unknown>>(`${definition.queueName}-dlq`, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
    const workerConnection = redis.duplicate();
    const worker = new Worker<Record<string, unknown>>(
      definition.queueName,
      async () => {
        await definition.processor();
      },
      {
        connection: workerConnection,
        concurrency: 1,
      },
    );

    worker.on('failed', (job, error) => {
      if (!job) {
        return;
      }

      const attemptsAllowed = readAttemptLimit(job);
      if (job.attemptsMade < attemptsAllowed) {
        return;
      }

      void enqueueDlqEntry(
        dlqQueue,
        definition,
        error.message,
        job.attemptsMade,
      ).catch((dlqError) => {
        logger.error('background_job.dlq_enqueue_failed', {
          queueName: definition.queueName,
          jobName: definition.jobName,
          error: dlqError instanceof Error ? dlqError.message : String(dlqError),
        });
      });

      logger.error('background_job.dlq', {
        alert: 'background_job_dlq',
        queueName: definition.queueName,
        jobName: definition.jobName,
        attemptsMade: job.attemptsMade,
        error: error.message,
      });
    });

    await queue.upsertJobScheduler(
      `${definition.jobName}-scheduler`,
      { every: definition.repeatEveryMs },
      {
        name: definition.jobName,
        data: {
          jobName: definition.jobName,
        },
      },
    );

    queues.push(queue);
    dlqQueues.push(dlqQueue);
    workers.push(worker);
    workerConnections.push(workerConnection);
  }

  const runtime: BullmqBackgroundJobRuntime = {
    probe: async () => {
      await Promise.all(queues.map(async (queue) => {
        await Promise.all([
          queue.getWaitingCount(),
          queue.getDelayedCount(),
          queue.getActiveCount(),
        ]);
      }));
    },
    getQueueDepths: async () => {
      const entries = await Promise.all(
        queues.map(async (queue) => {
          const [waiting, delayed, active] = await Promise.all([
            queue.getWaitingCount(),
            queue.getDelayedCount(),
            queue.getActiveCount(),
          ]);

          return [queue.name, waiting + delayed + active] as const;
        }),
      );

      return Object.fromEntries(entries);
    },
    stop: async () => {
      const queueNames = queues.map((queue) => queue.name);
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all(queues.map((queue) => queue.close()));
      await Promise.all(dlqQueues.map((queue) => queue.close()));
      await Promise.all(workerConnections.map((connection) => connection.quit()));

      for (const queueName of queueNames) {
        setBullmqQueueDepth(queueName, 0);
      }

      if (activeBullmqRuntime === runtime) {
        activeBullmqRuntime = null;
      }
    },
  };

  activeBullmqRuntime = runtime;
  return runtime;
}

export async function probeBullmq(): Promise<'up' | 'down' | 'disabled'> {
  const env = getEnv();
  if (!(env.FEATURE_BULLMQ_JOBS && env.REDIS_URL)) {
    return 'disabled';
  }

  if (!activeBullmqRuntime) {
    return 'down';
  }

  try {
    await activeBullmqRuntime.probe();
    return 'up';
  } catch {
    return 'down';
  }
}
