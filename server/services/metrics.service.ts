type MetricType = 'counter' | 'gauge' | 'histogram';
type MetricLabels = Record<string, string | number | boolean | null | undefined>;
type NormalizedLabels = Record<string, string>;

interface MetricDefinition {
  type: MetricType;
  help: string;
  buckets?: number[];
}

interface NumericSeries {
  labels: NormalizedLabels;
  value: number;
}

interface HistogramSeries {
  labels: NormalizedLabels;
  buckets: number[];
  bucketCounts: number[];
  sum: number;
  count: number;
}

const DEFAULT_DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000];
const metricDefinitions = new Map<string, MetricDefinition>();
const counters = new Map<string, Map<string, NumericSeries>>();
const gauges = new Map<string, Map<string, NumericSeries>>();
const histograms = new Map<string, Map<string, HistogramSeries>>();
const collectors = new Map<string, () => Promise<void> | void>();

function normalizeLabels(labels: MetricLabels = {}): NormalizedLabels {
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );
}

function getLabelsKey(labels: NormalizedLabels): string {
  return JSON.stringify(labels);
}

function escapeMetricValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatLabels(labels: NormalizedLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return '';
  }

  return `{${entries.map(([key, value]) => `${key}="${escapeMetricValue(value)}"`).join(',')}}`;
}

function ensureDefinition(name: string, definition: MetricDefinition): MetricDefinition {
  const existing = metricDefinitions.get(name);
  if (existing) {
    return existing;
  }

  metricDefinitions.set(name, definition);
  return definition;
}

function getOrCreateNumericSeries(
  store: Map<string, Map<string, NumericSeries>>,
  metricName: string,
  labels: NormalizedLabels,
): NumericSeries {
  const labelKey = getLabelsKey(labels);
  const metricSeries = store.get(metricName) ?? new Map<string, NumericSeries>();
  const series = metricSeries.get(labelKey) ?? { labels, value: 0 };
  metricSeries.set(labelKey, series);
  store.set(metricName, metricSeries);
  return series;
}

function getOrCreateHistogramSeries(
  metricName: string,
  labels: NormalizedLabels,
  buckets: number[],
): HistogramSeries {
  const labelKey = getLabelsKey(labels);
  const metricSeries = histograms.get(metricName) ?? new Map<string, HistogramSeries>();
  const series = metricSeries.get(labelKey) ?? {
    labels,
    buckets,
    bucketCounts: Array.from({ length: buckets.length }, () => 0),
    sum: 0,
    count: 0,
  };
  metricSeries.set(labelKey, series);
  histograms.set(metricName, metricSeries);
  return series;
}

function incrementCounter(name: string, help: string, labels: MetricLabels, value = 1): void {
  ensureDefinition(name, { type: 'counter', help });
  const normalizedLabels = normalizeLabels(labels);
  const series = getOrCreateNumericSeries(counters, name, normalizedLabels);
  series.value += value;
}

function setGauge(name: string, help: string, labels: MetricLabels, value: number): void {
  ensureDefinition(name, { type: 'gauge', help });
  const normalizedLabels = normalizeLabels(labels);
  const series = getOrCreateNumericSeries(gauges, name, normalizedLabels);
  series.value = value;
}

function observeHistogram(
  name: string,
  help: string,
  labels: MetricLabels,
  value: number,
  buckets = DEFAULT_DURATION_BUCKETS_MS,
): void {
  const definition = ensureDefinition(name, { type: 'histogram', help, buckets });
  const normalizedLabels = normalizeLabels(labels);
  const series = getOrCreateHistogramSeries(name, normalizedLabels, definition.buckets ?? buckets);
  series.sum += value;
  series.count += 1;

  for (let index = 0; index < series.buckets.length; index += 1) {
    const bucket = series.buckets[index];
    if (bucket === undefined) {
      continue;
    }

    if (value <= bucket) {
      series.bucketCounts[index] = (series.bucketCounts[index] ?? 0) + 1;
    }
  }
}

export function registerMetricsCollector(name: string, collector: () => Promise<void> | void): void {
  collectors.set(name, collector);
}

export function unregisterMetricsCollector(name: string): void {
  collectors.delete(name);
}

export function recordHttpRequest(params: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}): void {
  const labels = {
    method: params.method,
    route: params.route,
    status: params.statusCode,
  };

  incrementCounter('http_requests_total', 'Total HTTP requests processed by the API.', labels);
  observeHistogram(
    'http_request_duration_ms',
    'Observed HTTP request duration in milliseconds.',
    labels,
    params.durationMs,
  );
}

export function recordMongoOperation(params: {
  collection: string;
  operation: string;
  durationMs: number;
}): void {
  observeHistogram(
    'mongodb_operation_duration_ms',
    'Observed MongoDB operation duration in milliseconds.',
    {
      collection: params.collection,
      operation: params.operation,
    },
    params.durationMs,
  );
}

export function recordBackgroundJobRun(params: {
  job: string;
  outcome: 'success' | 'failure' | 'skipped_overlap';
  durationMs: number;
}): void {
  incrementCounter(
    'background_job_runs_total',
    'Total background job executions grouped by job and outcome.',
    {
      job: params.job,
      outcome: params.outcome,
    },
  );
  observeHistogram(
    'background_job_duration_ms',
    'Observed background job duration in milliseconds.',
    { job: params.job },
    params.durationMs,
  );
}

export function recordWithdrawalBalanceHoldFailure(reason: string): void {
  incrementCounter(
    'withdrawal_balance_hold_failures_total',
    'Total withdrawal admission failures caused by balance or invariant checks.',
    { reason },
  );
}

export function recordWithdrawalConfirmation(outcome: string): void {
  incrementCounter(
    'withdrawal_confirmations_total',
    'Total withdrawal confirmation attempts grouped by outcome.',
    { outcome },
  );
}

export function recordDepositIngestionDecision(decision: string): void {
  incrementCounter(
    'deposit_ingestion_total',
    'Total deposit ingestion decisions grouped by resulting action.',
    { decision },
  );
}

export function setWalletTonBalance(value: number): void {
  setGauge('wallet_ton_balance', 'Last observed TON balance for the hot wallet.', {}, value);
}

export function setWalletUsdtBalance(value: number): void {
  setGauge('wallet_usdt_balance', 'Last observed USDT balance for the hot wallet.', {}, value);
}

export function setWalletReserveDeltaUsdt(value: number): void {
  setGauge(
    'wallet_reserve_delta_usdt',
    'Last observed signed delta between on-chain USDT reserve and internal ledger liability.',
    {},
    value,
  );
}

export function setUnmatchedDepositsOpen(value: number): void {
  setGauge('unmatched_deposits_open', 'Current count of unresolved unmatched deposits.', {}, value);
}

export function setBullmqQueueDepth(queue: string, depth: number): void {
  setGauge('bullmq_queue_depth', 'Current BullMQ queue depth for each scheduler queue.', { queue }, depth);
}

export async function renderMetrics(): Promise<string> {
  for (const collector of collectors.values()) {
    try {
      await collector();
    } catch {
      // Best-effort metrics collection should not fail the endpoint.
    }
  }

  const lines: string[] = [];
  const metricNames = [...metricDefinitions.keys()].sort((left, right) => left.localeCompare(right));

  for (const metricName of metricNames) {
    const definition = metricDefinitions.get(metricName);
    if (!definition) {
      continue;
    }

    lines.push(`# HELP ${metricName} ${escapeMetricValue(definition.help)}`);
    lines.push(`# TYPE ${metricName} ${definition.type}`);

    if (definition.type === 'counter') {
      const metricSeries = counters.get(metricName);
      if (!metricSeries) {
        continue;
      }

      for (const series of metricSeries.values()) {
        lines.push(`${metricName}${formatLabels(series.labels)} ${series.value}`);
      }
      continue;
    }

    if (definition.type === 'gauge') {
      const metricSeries = gauges.get(metricName);
      if (!metricSeries) {
        continue;
      }

      for (const series of metricSeries.values()) {
        lines.push(`${metricName}${formatLabels(series.labels)} ${series.value}`);
      }
      continue;
    }

    const metricSeries = histograms.get(metricName);
    if (!metricSeries) {
      continue;
    }

    for (const series of metricSeries.values()) {
      for (let index = 0; index < series.buckets.length; index += 1) {
        const bucket = series.buckets[index];
        const count = series.bucketCounts[index] ?? 0;
        lines.push(
          `${metricName}_bucket${formatLabels({
            ...series.labels,
            le: String(bucket),
          })} ${count}`,
        );
      }

      lines.push(
        `${metricName}_bucket${formatLabels({
          ...series.labels,
          le: '+Inf',
        })} ${series.count}`,
      );
      lines.push(`${metricName}_sum${formatLabels(series.labels)} ${series.sum}`);
      lines.push(`${metricName}_count${formatLabels(series.labels)} ${series.count}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function resetMetricsForTests(): void {
  metricDefinitions.clear();
  counters.clear();
  gauges.clear();
  histograms.clear();
  collectors.clear();
}
