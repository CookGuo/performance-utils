# performance-utils

Web 前端性能优化工具函数库，聚焦三类问题：

- INP 优化：异步化执行、长任务切片、大数组分批处理
- LCP/TTFB 优化：图片预加载、preconnect、dns-prefetch、图片加载检测
- 持续监控：Web Vitals 上报、Long Task 监听

## 安装

```bash
npm i performance-utils
```

如果使用真实用户性能监控，需要同时安装 Google 官方 `web-vitals`：

```bash
npm i performance-utils web-vitals
```

如果使用 React Hook：

```bash
npm i performance-utils react
```

## 快速开始

```ts
import {
  asyncExecuteTask,
  taskSplitPoint,
  runArrayIterationTask,
  preloadImage,
  preconnect,
  initWebVitals,
} from 'performance-utils';

preconnect('https://cdn.example.com', { crossOrigin: true });

preloadImage('/hero.webp', {
  fetchPriority: 'high',
  imagesizes: '100vw',
});

initWebVitals({
  endpoint: '/api/analytics/performance',
  extra: { app: 'web' },
});

const handleClick = async () => {
  await asyncExecuteTask(() => doExpensiveOperationA());
  setVisible(true);

  await taskSplitPoint();

  await runArrayIterationTask(items, processItem, {
    batchSize: 500,
  });
};
```

React 子路径：

```tsx
import { useGifImg } from 'performance-utils/react';

function HeroGif() {
  const { displayUrl } = useGifImg({
    src: '/hero.gif',
    thumbnailUrl: '/hero-first-frame.png',
  });

  return <img src={displayUrl} fetchPriority="high" width={1200} height={600} />;
}
```

## API

### asyncExecuteTask

将一个任务延后执行，默认使用 `requestIdleCallback`，不支持时降级为 `setTimeout`。适合把非紧急副作用从当前交互处理中移出去，降低 INP 的 Processing Time。

```ts
function asyncExecuteTask<T>(
  fn: () => T | Promise<T>,
  options?: {
    highPriority?: boolean;
    runTimeout?: number;
    mustSplit?: boolean;
  }
): Promise<T>;
```

参数：

- `highPriority`: 使用 `queueMicrotask`，适合“稍后但尽快”的任务。注意微任务不会真正让出主线程。
- `runTimeout`: `requestIdleCallback` 的超时时间，默认 `300`。
- `mustSplit`: 使用 `setTimeout` 强制创建新的宏任务边界。

### asyncExecuteTaskHoc

把函数包装成自动异步执行的版本，适合事件处理函数。

```ts
function asyncExecuteTaskHoc<Args extends unknown[], R>(
  fn: (...args: Args) => R | Promise<R>,
  options?: AsyncExecuteTaskOptions
): (...args: Args) => Promise<R>;
```

### taskSplitPoint

插入一个宏任务切分点，用于把一个长任务拆成多个较短任务。

```ts
function taskSplitPoint(delay?: number): Promise<void>;
```

### runTasks

按顺序执行任务队列，并在任务之间自动插入 `taskSplitPoint`。

```ts
function runTasks<T>(
  tasks: Array<() => T | Promise<T>>,
  options?: {
    splitDelay?: number;
    signal?: AbortSignal;
    onProgress?: (info: { index: number; total: number }) => void;
    stopOnError?: true;
  }
): Promise<T[]>;

function runTasks<T>(
  tasks: Array<() => T | Promise<T>>,
  options: {
    stopOnError: false;
    splitDelay?: number;
    signal?: AbortSignal;
    onProgress?: (info: { index: number; total: number }) => void;
  }
): Promise<PromiseSettledResult<T>[]>;
```

### runTasksParallel

并行执行多个独立任务，返回 `Promise.allSettled` 结果。

```ts
function runTasksParallel<T>(
  tasks: Array<() => T | Promise<T>>,
  options?: { signal?: AbortSignal }
): Promise<PromiseSettledResult<T>[]>;
```

### runArrayIterationTask

对大数组做分批遍历，每处理一批后让出主线程。

```ts
function runArrayIterationTask<T, R>(
  array: readonly T[],
  fn: (value: T, index: number, array: readonly T[]) => R | Promise<R>,
  options?:
    | number
    | {
        batchSize?: number;
        splitCount?: number;
        splitDelay?: number;
        signal?: AbortSignal;
        onProgress?: (info: {
          processed: number;
          total: number;
          batchIndex: number;
        }) => void;
      }
): Promise<R[]>;
```

说明：

- 传数字时表示 `batchSize`。
- `batchSize` 表示每批处理多少条。
- `splitCount` 表示把数组近似拆成多少批，未传时默认 `2`。

### loadImage

加载图片并返回 `HTMLImageElement`，可用于 GIF 首帧优化、图片预热、错误兜底。

```ts
function loadImage(
  src: string,
  options?: {
    timeout?: number;
    crossOrigin?: '' | 'anonymous' | 'use-credentials';
    referrerPolicy?: ReferrerPolicy;
    fetchPriority?: 'high' | 'low' | 'auto';
  }
): Promise<HTMLImageElement>;
```

### preloadImage

向 `document.head` 注入图片 preload。

```ts
function preloadImage(
  src: string,
  options?: {
    id?: string;
    type?: string;
    imagesrcset?: string;
    imagesizes?: string;
    crossOrigin?: '' | 'anonymous' | 'use-credentials';
    referrerPolicy?: ReferrerPolicy;
    fetchPriority?: 'high' | 'low' | 'auto';
  }
): HTMLLinkElement | null;
```

### preconnect / dnsPrefetch

向 `document.head` 注入网络资源提示。

```ts
function preconnect(
  href: string,
  options?: { id?: string; crossOrigin?: boolean | string }
): HTMLLinkElement | null;

function dnsPrefetch(
  href: string,
  options?: { id?: string }
): HTMLLinkElement | null;
```

### initWebVitals

注册 LCP、INP、CLS、FCP、TTFB 监听，并可自动上报到接口。

```ts
function initWebVitals(options?: {
  endpoint?: string;
  include?: Array<'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'>;
  reportAllChanges?: boolean;
  onReport?: (metric: {
    name: string;
    value: number;
    rating?: string;
    id?: string;
    delta?: number;
    navigationType?: string;
    url?: string;
    timestamp: number;
    extra?: Record<string, unknown>;
  }) => void;
  onError?: (error: unknown) => void;
  extra?: Record<string, unknown>;
}): () => void;
```

### observeLongTasks

监听浏览器 Long Task，帮助定位主线程阻塞。

```ts
function observeLongTasks(
  callback: (entry: PerformanceEntry) => void,
  options?: {
    buffered?: boolean;
    minDuration?: number;
  }
): () => void;
```

### useGifImg

React Hook。先展示 GIF 首帧静态图，GIF 加载完成后再切换。

```ts
function useGifImg(options: {
  src: string;
  thumbnailUrl?: string;
  enabled?: boolean;
}): {
  isGif: boolean;
  displayUrl: string;
  loaded: boolean;
  error: boolean;
};
```

## 性能场景对接

### INP：交互响应优化

INP 差通常来自主线程被长任务阻塞，或者事件处理函数里同步执行了过多逻辑。这个库提供两类能力：把非紧急任务挪到当前交互之后执行，以及把大任务拆成多个小任务。

适用方法：

- `asyncExecuteTask`: 将任务延后执行，默认走 `requestIdleCallback`，适合日志、埋点、非紧急状态同步、低优先级副作用。
- `asyncExecuteTaskHoc`: 把一个函数包装成异步执行版本，适合直接包装点击、输入等事件处理函数。
- `taskSplitPoint`: 在长函数中手动插入切分点，让浏览器有机会处理输入和渲染。
- `runTasks`: 顺序执行任务列表，每个任务之间自动让出主线程。
- `runTasksParallel`: 并行启动多个独立任务，并用 `Promise.allSettled` 收集结果。
- `runArrayIterationTask`: 分批处理大数组，适合大列表过滤、批量格式化、批量计算。

推荐用法：

```ts
import {
  asyncExecuteTask,
  taskSplitPoint,
  runArrayIterationTask,
} from 'performance-utils';

const handleFilterChange = async (filter: string) => {
  setFiltering(true);

  await taskSplitPoint();

  const result = await runArrayIterationTask(
    transactions,
    (tx) => (matchFilter(tx, filter) ? tx : null),
    { batchSize: 500 }
  );

  setFilteredTransactions(result.filter(Boolean));

  await asyncExecuteTask(() => {
    reportFilterUsage(filter);
  });
};
```

选型建议：

- 事件处理里有非紧急副作用：优先用 `asyncExecuteTask`。
- 一个函数中有多个明显阶段：优先在阶段之间插入 `taskSplitPoint`。
- 多个任务必须按顺序执行：用 `runTasks`。
- 多个任务相互独立：用 `runTasksParallel`。
- 大数组遍历或批量处理：用 `runArrayIterationTask`，优先传 `batchSize`。

### LCP：首屏最大内容优化

LCP 慢常见原因是首屏图片发现太晚、加载优先级太低、图片本身过大，或者 GIF 首屏直接加载了完整动图。

适用方法：

- `preloadImage`: 在 `document.head` 注入图片 `preload`，适合 CSS background-image、JS 动态渲染图片、首屏主图。
- `loadImage`: 提前加载图片并感知成功/失败，适合图片预热、GIF 加载完成后切换、错误兜底。
- `useGifImg`: React 场景下先展示 GIF 首帧静态图，GIF 加载完成后再切换到动图。

推荐用法：

```ts
import { preloadImage } from 'performance-utils';

preloadImage('/hero.webp', {
  fetchPriority: 'high',
  imagesrcset: '/hero-small.webp 400w, /hero-large.webp 1200w',
  imagesizes: '100vw',
  type: 'image/webp',
});
```

```tsx
import { useGifImg } from 'performance-utils/react';

function Banner() {
  const { displayUrl } = useGifImg({
    src: '/banner.gif',
    thumbnailUrl: '/banner-first-frame.png',
  });

  return <img src={displayUrl} width={1200} height={600} fetchPriority="high" />;
}
```

使用约束：

- `fetchPriority: 'high'` 只应该给真正的首屏关键图片使用。
- 图片元素仍然应该显式设置 `width` 和 `height`，避免引入 CLS。
- `preloadImage` 只负责资源提示，不负责压缩图片；图片格式和体积仍需在构建或资源侧处理。

### TTFB 与网络连接优化

第三方 CDN、字体、图片域名、接口域名如果需要建立 DNS、TCP、TLS 连接，首个请求可能被连接建立时间拖慢。可以提前给浏览器连接提示。

适用方法：

- `preconnect`: 提前建立 DNS、TCP、TLS 连接，适合高确定性会用到的关键域名。
- `dnsPrefetch`: 只提前 DNS 解析，适合可能会用到但不确定的域名。

推荐用法：

```ts
import { preconnect, dnsPrefetch } from 'performance-utils';

preconnect('https://cdn.example.com', { crossOrigin: true });
dnsPrefetch('https://analytics.example.com');
```

选型建议：

- 首屏主图、字体、核心 API 所在域名：用 `preconnect`。
- 统计、推荐、非首屏资源域名：用 `dnsPrefetch`。
- 不要对大量域名滥用 `preconnect`，否则会抢占连接和网络资源。

### RUM：真实性能监控

实验室数据只能说明固定环境下的表现，线上仍需要采集真实用户指标。这个库封装了 Core Web Vitals 上报和 Long Task 监听。

适用方法：

- `initWebVitals`: 采集 `LCP`、`INP`、`CLS`、`FCP`、`TTFB`，可通过 `endpoint` 自动上报。
- `observeLongTasks`: 监听浏览器 Long Task，用于定位主线程阻塞来源。

推荐用法：

```ts
import { initWebVitals, observeLongTasks } from 'performance-utils';

const stopVitals = initWebVitals({
  endpoint: '/api/analytics/performance',
  include: ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'],
  extra: {
    app: 'wallet-web',
    release: '1.0.0',
  },
});

const stopLongTasks = observeLongTasks((entry) => {
  console.log('long task', {
    duration: entry.duration,
    startTime: entry.startTime,
  });
});

// 页面卸载或应用销毁时可停止后续上报
stopVitals();
stopLongTasks();
```

上报数据结构：

```ts
type WebVitalsPayload = {
  name: string;
  value: number;
  rating?: string;
  id?: string;
  delta?: number;
  navigationType?: string;
  url?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
};
```

### CLS：布局稳定性配合约定

这个库不直接修改业务 DOM 布局，但资源和图片相关方法需要和以下约定一起使用：

- 图片、视频、首屏媒体元素必须设置明确的 `width` 和 `height`，或用 CSS `aspect-ratio` 预留空间。
- 动态插入的 banner、广告、提示条应提前预留容器高度，或使用 `position: fixed` 避免推动文档流。
- 骨架屏尺寸应尽量与真实内容一致。
- Web 字体建议配置 `font-display: optional` 或使用尺寸接近的 fallback 字体。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```
