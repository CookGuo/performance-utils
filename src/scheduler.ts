export type MaybePromise<T> = T | Promise<T>;

export interface AsyncExecuteTaskOptions {
  /**
   * Use queueMicrotask when the task should run after the current stack but
   * before the next macrotask. This does not create a hard task boundary.
   */
  highPriority?: boolean;
  /**
   * Timeout passed to requestIdleCallback. Defaults to 300ms.
   */
  runTimeout?: number;
  /**
   * Force a macrotask boundary with setTimeout.
   */
  mustSplit?: boolean;
}

export interface RunTasksBaseOptions {
  /**
   * Delay used by taskSplitPoint between tasks. Defaults to 1ms.
   */
  splitDelay?: number;
  signal?: AbortSignal;
  onProgress?: (info: { index: number; total: number }) => void;
}

export interface RunTasksOptions extends RunTasksBaseOptions {
  stopOnError?: true;
}

export interface RunTasksSettledOptions extends RunTasksBaseOptions {
  /**
   * When false, every task is executed and the return value uses
   * PromiseSettledResult objects.
   */
  stopOnError: false;
}

export interface RunTasksParallelOptions {
  signal?: AbortSignal;
}

export interface RunArrayIterationTaskOptions {
  /**
   * Number of array items to process before yielding to the browser.
   */
  batchSize?: number;
  /**
   * Alternative to batchSize. Splits the array into roughly this many chunks.
   */
  splitCount?: number;
  splitDelay?: number;
  signal?: AbortSignal;
  onProgress?: (info: {
    processed: number;
    total: number;
    batchIndex: number;
  }) => void;
}

const DEFAULT_IDLE_TIMEOUT = 300;
const DEFAULT_SPLIT_DELAY = 1;
const DEFAULT_SPLIT_COUNT = 2;

type IdleCallback = (deadline: IdleDeadline) => void;

interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): DOMHighResTimeStamp;
}

interface RequestIdleCallbackOptions {
  timeout?: number;
}

type RequestIdleCallback = (
  callback: IdleCallback,
  options?: RequestIdleCallbackOptions
) => number;

function getRequestIdleCallback(): RequestIdleCallback | undefined {
  const candidate = (globalThis as { requestIdleCallback?: RequestIdleCallback })
    .requestIdleCallback;

  return typeof candidate === 'function' ? candidate.bind(globalThis) : undefined;
}

function runRequestIdleCallback(callback: () => void, timeout: number): void {
  const requestIdleCallback = getRequestIdleCallback();

  if (requestIdleCallback) {
    requestIdleCallback(callback, { timeout });
    return;
  }

  setTimeout(callback, DEFAULT_SPLIT_DELAY);
}

function runQueueMicrotask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }

  Promise.resolve().then(callback);
}

function normalizeDelay(delay: number | undefined): number {
  if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
    return DEFAULT_SPLIT_DELAY;
  }

  return delay;
}

function normalizeTimeout(timeout: number | undefined): number {
  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 0) {
    return DEFAULT_IDLE_TIMEOUT;
  }

  return timeout;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function getAbortReason(signal: AbortSignal): unknown {
  if ('reason' in signal) {
    return signal.reason;
  }

  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw getAbortReason(signal);
  }
}

function getBatchSize(
  length: number,
  options?: RunArrayIterationTaskOptions | number
): number {
  if (typeof options === 'number') {
    return normalizePositiveInteger(options, Math.ceil(length / DEFAULT_SPLIT_COUNT));
  }

  if (options?.batchSize !== undefined) {
    return normalizePositiveInteger(
      options.batchSize,
      Math.ceil(length / DEFAULT_SPLIT_COUNT)
    );
  }

  const splitCount = normalizePositiveInteger(
    options?.splitCount,
    DEFAULT_SPLIT_COUNT
  );

  return Math.max(1, Math.ceil(length / splitCount));
}

export function asyncExecuteTask<T>(
  fn: () => MaybePromise<T>,
  options: AsyncExecuteTaskOptions = {}
): Promise<T> {
  const {
    highPriority = false,
    runTimeout = DEFAULT_IDLE_TIMEOUT,
    mustSplit = false,
  } = options;

  return new Promise<T>((resolve, reject) => {
    const run = (): void => {
      try {
        Promise.resolve(fn()).then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    };

    if (mustSplit) {
      setTimeout(run, DEFAULT_SPLIT_DELAY);
      return;
    }

    if (highPriority) {
      runQueueMicrotask(run);
      return;
    }

    runRequestIdleCallback(run, normalizeTimeout(runTimeout));
  });
}

export function asyncExecuteTaskHoc<Args extends unknown[], R>(
  fn: (...args: Args) => MaybePromise<R>,
  options?: AsyncExecuteTaskOptions
): (...args: Args) => Promise<R> {
  return (...args: Args) => asyncExecuteTask(() => fn(...args), options);
}

export function taskSplitPoint(delay: number = DEFAULT_SPLIT_DELAY): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, normalizeDelay(delay));
  });
}

export function runTasks<T>(
  tasks: Array<() => MaybePromise<T>>,
  options?: RunTasksOptions
): Promise<T[]>;
export function runTasks<T>(
  tasks: Array<() => MaybePromise<T>>,
  options: RunTasksSettledOptions
): Promise<PromiseSettledResult<T>[]>;
export async function runTasks<T>(
  tasks: Array<() => MaybePromise<T>>,
  options: RunTasksOptions | RunTasksSettledOptions = {}
): Promise<T[] | PromiseSettledResult<T>[]> {
  const settledMode = options.stopOnError === false;
  const results: Array<T | PromiseSettledResult<T>> = [];

  for (let index = 0; index < tasks.length; index += 1) {
    throwIfAborted(options.signal);

    const task = tasks[index];

    if (!task) {
      continue;
    }

    try {
      const value = await task();
      results.push(
        settledMode ? ({ status: 'fulfilled', value } satisfies PromiseFulfilledResult<T>) : value
      );
    } catch (reason) {
      if (!settledMode) {
        throw reason;
      }

      results.push({ status: 'rejected', reason } satisfies PromiseRejectedResult);
    }

    options.onProgress?.({ index, total: tasks.length });

    if (index < tasks.length - 1) {
      await taskSplitPoint(options.splitDelay);
    }
  }

  return results as T[] | PromiseSettledResult<T>[];
}

export function runTasksParallel<T>(
  tasks: Array<() => MaybePromise<T>>,
  options: RunTasksParallelOptions = {}
): Promise<PromiseSettledResult<T>[]> {
  return Promise.resolve()
    .then(() => {
      throwIfAborted(options.signal);

      return Promise.allSettled(
        tasks.map((task) =>
          Promise.resolve().then(() => {
            throwIfAborted(options.signal);
            return task();
          })
        )
      );
    });
}

export async function runArrayIterationTask<T, R>(
  array: readonly T[],
  fn: (value: T, index: number, array: readonly T[]) => MaybePromise<R>,
  options: RunArrayIterationTaskOptions | number = {}
): Promise<R[]> {
  const result: R[] = [];
  const batchSize = getBatchSize(array.length, options);
  const splitDelay = typeof options === 'number' ? undefined : options.splitDelay;
  const signal = typeof options === 'number' ? undefined : options.signal;
  const onProgress = typeof options === 'number' ? undefined : options.onProgress;

  for (let index = 0; index < array.length; index += 1) {
    throwIfAborted(signal);
    result.push(await fn(array[index] as T, index, array));

    const processed = index + 1;

    if (processed % batchSize === 0 || processed === array.length) {
      onProgress?.({
        processed,
        total: array.length,
        batchIndex: Math.ceil(processed / batchSize) - 1,
      });
    }

    if (processed % batchSize === 0 && processed < array.length) {
      await taskSplitPoint(splitDelay);
    }
  }

  return result;
}
