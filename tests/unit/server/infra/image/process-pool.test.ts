import type { Worker } from 'node:worker_threads'

import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: vi.fn(),
}))

const { WorkerPool, getProcessPool, stopProcessPool, __setWorkerFactory, __resetWorkerFactory } =
  await import('@/server/infra/image/process-pool')

class FakeWorker extends EventEmitter {
  posted: Array<{ id: number; type: string; input: unknown }> = []
  terminated = false
  postMessage(msg: { id: number; type: string; input: unknown }) {
    this.posted.push(msg)
  }
  async terminate() {
    this.terminated = true
    return 0
  }
}

// The pool's factory signature is `() => Worker` (node:worker_threads).
// FakeWorker is an EventEmitter stand-in, so we cast at the boundary; at
// runtime every worker is still a FakeWorker instance the test drives.
function createFakeWorker(): Worker {
  return new FakeWorker() as unknown as Worker
}

function workersOf(
  pool: InstanceType<typeof WorkerPool>,
): Array<{ worker: FakeWorker; busy: boolean; currentJobId: number | null }> {
  return (pool as any).workers
}

describe('WorkerPool', () => {
  beforeEach(() => {
    __setWorkerFactory(createFakeWorker)
  })

  afterEach(() => {
    __resetWorkerFactory()
  })

  it('starts the configured number of workers and reports stats', async () => {
    const pool = new WorkerPool(2, createFakeWorker)
    await pool.start()
    expect(pool.stats().size).toBe(2)
    expect(pool.stats().idle).toBe(2)
    expect(pool.stats().queued).toBe(0)
    await pool.stop()
  })

  it('idempotently starts', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    await pool.start()
    expect(pool.stats().size).toBe(1)
    await pool.stop()
  })

  it('processes an image and resolves with buffered result', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    const worker = workersOf(pool)[0].worker

    const promise = pool.process({ buffer: Buffer.from('input'), jpegQuality: 80 })
    const request = worker.posted[0]
    worker.emit('message', {
      type: 'process:result',
      id: request.id,
      ok: true,
      result: { buffer: new Uint8Array([1, 2, 3]), width: 100, height: 100 },
    })
    const result = await promise
    expect(Buffer.isBuffer(result.buffer)).toBe(true)
    expect(result.width).toBe(100)
    await pool.stop()
  })

  it('queues jobs when all workers are busy', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    const poolWorker = workersOf(pool)[0]

    const p1 = pool.process({ buffer: Buffer.from('a'), jpegQuality: 80 })
    const request1 = poolWorker.worker.posted[0]
    expect(poolWorker.worker.posted.length).toBe(1)

    // Force worker busy so the next job must queue.
    poolWorker.busy = true
    const p2 = pool.process({ buffer: Buffer.from('b'), jpegQuality: 80 })
    expect(pool.stats().queued).toBe(1)

    // Resolve the first job; the drain loop should then dispatch the queued one.
    poolWorker.worker.emit('message', {
      type: 'process:result',
      id: request1.id,
      ok: true,
      result: { buffer: Buffer.from('out1'), width: 1, height: 1 },
    })
    await p1

    const request2 = poolWorker.worker.posted[1]
    poolWorker.worker.emit('message', {
      type: 'process:result',
      id: request2.id,
      ok: true,
      result: { buffer: Buffer.from('out2'), width: 2, height: 2 },
    })
    await p2
    await pool.stop()
  })

  it('rejects with a DomainError when the worker reports one', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    const worker = workersOf(pool)[0].worker
    const promise = pool.process({ buffer: Buffer.from('x'), jpegQuality: 80 })
    const request = worker.posted[0]
    worker.emit('message', {
      type: 'process:result',
      id: request.id,
      ok: false,
      error: { name: 'DomainError', code: 'BAD_REQUEST', message: 'bad' },
    })
    await expect(promise).rejects.toThrow('bad')
    await pool.stop()
  })

  it('rejects queued and pending jobs when stopped', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    workersOf(pool)[0].busy = true
    const promise = pool.process({ buffer: Buffer.from('x'), jpegQuality: 80 })
    await pool.stop()
    await expect(promise).rejects.toThrow('process pool is shutting down')
  })

  it('rejects new process calls after stop', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    await pool.stop()
    await expect(pool.process({ buffer: Buffer.from('x'), jpegQuality: 80 })).rejects.toThrow('has been stopped')
  })

  it('handles worker errors while a job is in flight', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    const poolWorker = workersOf(pool)[0]
    const worker = poolWorker.worker
    const promise = pool.process({ buffer: Buffer.from('x'), jpegQuality: 80 })
    const request = worker.posted[0]
    expect(poolWorker.currentJobId).toBe(request.id)
    worker.emit('error', new Error('worker died'))
    await expect(promise).rejects.toThrow('worker died')
    expect(poolWorker.busy).toBe(false)
    await pool.stop()
  })

  it('ignores stale results and non-result messages', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    const worker = workersOf(pool)[0].worker
    worker.emit('message', { type: 'unknown' })
    worker.emit('message', { type: 'process:result', id: 99999, ok: true, result: {} })
    await pool.stop()
  })
})

describe('process-pool singleton', () => {
  beforeEach(() => {
    __setWorkerFactory(createFakeWorker)
  })

  afterEach(async () => {
    await stopProcessPool()
    __resetWorkerFactory()
  })

  it('returns a memoised pool', async () => {
    const pool1 = await getProcessPool()
    const pool2 = await getProcessPool()
    expect(pool1).toBe(pool2)
    await stopProcessPool()
  })
})
