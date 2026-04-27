import { describe, expect, it } from 'vitest';
import {
  asyncExecuteTask,
  asyncExecuteTaskHoc,
  runArrayIterationTask,
  runTasks,
  runTasksParallel,
  taskSplitPoint,
} from '../scheduler';

describe('scheduler utilities', () => {
  it('asyncExecuteTask resolves task result', async () => {
    await expect(asyncExecuteTask(() => 1, { mustSplit: true })).resolves.toBe(1);
  });

  it('asyncExecuteTaskHoc forwards arguments', async () => {
    const add = asyncExecuteTaskHoc((a: number, b: number) => a + b, {
      highPriority: true,
    });

    await expect(add(1, 2)).resolves.toBe(3);
  });

  it('taskSplitPoint yields a promise boundary', async () => {
    const order: string[] = [];
    const promise = taskSplitPoint().then(() => order.push('split'));

    order.push('sync');
    await promise;

    expect(order).toEqual(['sync', 'split']);
  });

  it('runTasks executes tasks sequentially', async () => {
    const order: number[] = [];
    const result = await runTasks([
      () => {
        order.push(1);
        return 'a';
      },
      () => {
        order.push(2);
        return 'b';
      },
    ]);

    expect(order).toEqual([1, 2]);
    expect(result).toEqual(['a', 'b']);
  });

  it('runTasks can return settled results', async () => {
    const result = await runTasks(
      [
        () => 1,
        () => {
          throw new Error('failed');
        },
      ],
      { stopOnError: false }
    );

    expect(result[0]).toMatchObject({ status: 'fulfilled', value: 1 });
    expect(result[1]).toMatchObject({ status: 'rejected' });
  });

  it('runTasksParallel settles all tasks', async () => {
    const result = await runTasksParallel([
      () => Promise.resolve(1),
      () => Promise.reject(new Error('failed')),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ status: 'fulfilled', value: 1 });
    expect(result[1]).toMatchObject({ status: 'rejected' });
  });

  it('runArrayIterationTask processes by batch size', async () => {
    const progress: number[] = [];
    const result = await runArrayIterationTask(
      [1, 2, 3, 4, 5],
      (value) => value * 2,
      {
        batchSize: 2,
        onProgress: ({ processed }) => progress.push(processed),
      }
    );

    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(progress).toEqual([2, 4, 5]);
  });
});
