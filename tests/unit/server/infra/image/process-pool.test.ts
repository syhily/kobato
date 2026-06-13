import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DomainError } from '@/server/infra/http/errors'
import {
  WorkerPool,
  type ProcessPoolStats,
  __resetWorkerFactory,
  __setWorkerFactory,
} from '@/server/infra/image/process-pool'

// Resolve the worker source as an absolute filesystem path so Node's
// `worker_threads` finds it regardless of where Vitest places the
// transformed test module. `--experimental-strip-types` (passed via
// execArgv below) lets Node execute the `.ts` file directly, and the
// worker uses a relative import for thumbhash (no `@/` aliases) so it
// loads without a bundler.
const WORKER_SOURCE = resolve(process.cwd(), 'src/server/infra/image/process-worker.ts')

function createSourceWorker(): Worker {
  return new Worker(WORKER_SOURCE, {
    execArgv: ['--experimental-strip-types'],
  })
}

async function syntheticPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer()
}

describe('server/infra/image/process-pool — WorkerPool', () => {
  let pool: WorkerPool

  beforeEach(() => {
    __setWorkerFactory(createSourceWorker)
    pool = new WorkerPool(2, createSourceWorker)
  })

  afterEach(async () => {
    __resetWorkerFactory()
    await pool.stop().catch(() => {})
  })

  it('processes a small PNG end-to-end (decode → JPEG → thumbhash)', async () => {
    await pool.start()
    const input = await syntheticPng(128, 96, { r: 32, g: 64, b: 128 })

    const result = await pool.process({ buffer: input, jpegQuality: 80 })

    expect(result.width).toBe(128)
    expect(result.height).toBe(96)
    expect(result.byteSize).toBe(result.buffer.byteLength)
    // JPEG magic bytes.
    expect(result.buffer.subarray(0, 2).toString('hex')).toBe('ffd8')
    expect(typeof result.thumbhash).toBe('string')
    expect(result.thumbhash.length).toBeGreaterThan(8)
  })

  it('rehydrates worker errors into DomainError instances', async () => {
    await pool.start()
    const garbage = Buffer.from('this is not an image')

    await expect(pool.process({ buffer: garbage, jpegQuality: 80 })).rejects.toBeInstanceOf(DomainError)
  })

  it('serialises jobs when the pool is saturated (POOL_SIZE + 2 concurrent)', async () => {
    // Pool size 2; submit 4 jobs. Every job should still resolve — the
    // pool must queue the overflow rather than rejecting.
    await pool.start()
    const inputs = await Promise.all([
      syntheticPng(64, 64, { r: 255, g: 0, b: 0 }),
      syntheticPng(64, 64, { r: 0, g: 255, b: 0 }),
      syntheticPng(64, 64, { r: 0, g: 0, b: 255 }),
      syntheticPng(64, 64, { r: 128, g: 128, b: 128 }),
    ])

    const results = await Promise.all(inputs.map((buffer) => pool.process({ buffer, jpegQuality: 75 })))

    expect(results).toHaveLength(4)
    for (const r of results) {
      expect(r.width).toBe(64)
      expect(r.height).toBe(64)
    }
  })

  it('reports accurate stats (size / idle / queued)', async () => {
    await pool.start()

    const before: ProcessPoolStats = pool.stats()
    expect(before.size).toBe(2)
    expect(before.idle).toBe(2)
    expect(before.queued).toBe(0)

    // Hold two workers busy simultaneously, then queue a third job that
    // must wait.
    const slow1 = pool.process({ buffer: await syntheticPng(200, 200, { r: 1, g: 2, b: 3 }), jpegQuality: 80 })
    const slow2 = pool.process({ buffer: await syntheticPng(200, 200, { r: 4, g: 5, b: 6 }), jpegQuality: 80 })
    const queued = pool.process({ buffer: await syntheticPng(50, 50, { r: 7, g: 8, b: 9 }), jpegQuality: 80 })

    // Give the workers a tick to pick up the first two jobs.
    await new Promise((r) => setTimeout(r, 20))
    const during: ProcessPoolStats = pool.stats()
    expect(during.idle).toBe(0)
    expect(during.queued).toBeGreaterThanOrEqual(1)

    await Promise.all([slow1, slow2, queued])

    const after: ProcessPoolStats = pool.stats()
    expect(after.idle).toBe(2)
    expect(after.queued).toBe(0)
  })
})

describe('server/infra/image/process-pool — stop()', () => {
  beforeEach(() => {
    __setWorkerFactory(createSourceWorker)
  })

  afterEach(() => {
    __resetWorkerFactory()
  })

  it('rejects in-flight jobs on stop()', async () => {
    const pool = new WorkerPool(1, createSourceWorker)
    await pool.start()

    // Submit a job but attach the rejection handler BEFORE calling stop()
    // so Node doesn't emit an unhandled-rejection warning in the gap
    // between stop() rejecting the promise and the assertion attaching.
    const input = await syntheticPng(300, 300, { r: 10, g: 20, b: 30 })
    const job = pool.process({ buffer: input, jpegQuality: 85 })
    const assertion = expect(job).rejects.toThrow()

    // Stop immediately — the job should be rejected.
    await pool.stop()

    await assertion
  })

  it('is idempotent (calling stop twice is safe)', async () => {
    const pool = new WorkerPool(1, createSourceWorker)
    await pool.start()
    await pool.stop()
    await expect(pool.stop()).resolves.not.toThrow()
  })

  it('rejects new jobs after stop()', async () => {
    const pool = new WorkerPool(1, createSourceWorker)
    await pool.start()
    await pool.stop()

    const input = await syntheticPng(32, 32, { r: 0, g: 0, b: 0 })
    await expect(pool.process({ buffer: input, jpegQuality: 80 })).rejects.toThrow('stopped')
  })
})
