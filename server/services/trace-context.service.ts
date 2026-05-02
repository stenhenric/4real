import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceContext {
  traceId?: string;
  requestId?: string;
  userId?: string;
  socketId?: string;
  job?: string;
}

const traceContextStorage = new AsyncLocalStorage<TraceContext>();

export function runWithTraceContext<T>(context: TraceContext, work: () => T): T {
  const current = traceContextStorage.getStore() ?? {};
  return traceContextStorage.run({ ...current, ...context }, work);
}

export function getTraceContext(): TraceContext {
  return traceContextStorage.getStore() ?? {};
}

export function assignTraceContext(context: Partial<TraceContext>): void {
  const current = traceContextStorage.getStore();
  if (!current) {
    return;
  }

  Object.assign(current, context);
}
