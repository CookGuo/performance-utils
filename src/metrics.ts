export type WebVitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';

export interface WebVitalsMetric {
  name: WebVitalName | string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  id?: string;
  delta?: number;
  navigationType?: string;
}

export interface WebVitalsPayload {
  name: string;
  value: number;
  rating?: string;
  id?: string;
  delta?: number;
  navigationType?: string;
  url?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
}

export interface InitWebVitalsOptions {
  endpoint?: string;
  include?: WebVitalName[];
  reportAllChanges?: boolean;
  onReport?: (metric: WebVitalsPayload) => void;
  onError?: (error: unknown) => void;
  extra?: Record<string, unknown>;
}

export interface ObserveLongTasksOptions {
  buffered?: boolean;
  minDuration?: number;
}

type WebVitalsModule = Partial<
  Record<
    `on${WebVitalName}`,
    (
      callback: (metric: WebVitalsMetric) => void,
      options?: { reportAllChanges?: boolean }
    ) => void
  >
>;

const DEFAULT_WEB_VITALS: WebVitalName[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

function getCurrentUrl(): string | undefined {
  if (typeof location === 'undefined') {
    return undefined;
  }

  return location.href;
}

function createPayload(
  metric: WebVitalsMetric,
  extra?: Record<string, unknown>
): WebVitalsPayload {
  return {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    delta: metric.delta,
    navigationType: metric.navigationType,
    url: getCurrentUrl(),
    timestamp: Date.now(),
    extra,
  };
}

function sendPayload(endpoint: string, payload: WebVitalsPayload): void {
  const body = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });

    if (navigator.sendBeacon(endpoint, blob)) {
      return;
    }
  }

  if (typeof fetch === 'function') {
    fetch(endpoint, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
      },
      keepalive: true,
    }).catch(() => {
      // RUM reporting must never affect the product workflow.
    });
  }
}

function importWebVitals(): Promise<WebVitalsModule> {
  return import('web-vitals') as Promise<WebVitalsModule>;
}

export function initWebVitals(options: InitWebVitalsOptions = {}): () => void {
  let active = true;
  const include = new Set(options.include ?? DEFAULT_WEB_VITALS);

  const report = (metric: WebVitalsMetric): void => {
    if (!active) {
      return;
    }

    const payload = createPayload(metric, options.extra);

    options.onReport?.(payload);

    if (options.endpoint) {
      sendPayload(options.endpoint, payload);
    }
  };

  importWebVitals()
    .then((webVitals) => {
      if (!active) {
        return;
      }

      for (const name of include) {
        const listener = webVitals[`on${name}`];

        if (typeof listener === 'function') {
          listener(report, { reportAllChanges: options.reportAllChanges });
        }
      }
    })
    .catch((error) => {
      options.onError?.(error);
    });

  return () => {
    active = false;
  };
}

export function observeLongTasks(
  callback: (entry: PerformanceEntry) => void,
  options: ObserveLongTasksOptions = {}
): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => undefined;
  }

  const minDuration = options.minDuration ?? 50;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration >= minDuration) {
        callback(entry);
      }
    }
  });

  try {
    observer.observe({
      type: 'longtask',
      buffered: options.buffered ?? true,
    });
  } catch {
    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      return () => undefined;
    }
  }

  return () => {
    observer.disconnect();
  };
}
