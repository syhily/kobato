import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'

import type {
  ProcessImageInput,
  ProcessedImage,
  WorkerErrResponse,
  WorkerOkResponse,
  WorkerRequest,
  WorkerResponse,
} from '@/server/infra/image/process-worker'

import { domainErrorFromWire } from '@/server/infra/http/errors'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { getEmbeddedAsset, isSea } from '@/server/infra/sea'
import { SEA_PROCESS_WORKER_BUNDLE_KEY } from '@/shared/sea/assets'

const log = getLogger('image:process-pool')

/**
 * Cap the Node worker count — libvips is already multi-threaded internally,
 * so one or two workers keep the request thread responsive without
 * saturating CPU.
 */
export const POOL_SIZE = Math.min(4, Math.max(1, availableParallelism()))

/**
 * Upper bound for one in-flight job — messages to dead workers are dropped
 * silently, so a deadline is the only thing preventing a permanent hang.
 */
export const JOB_TIMEOUT_MS = 60_000

export interface ProcessPoolStats {
  size: number
  idle: number
  queued: number
}

interface PendingJob {
  id: number
  input: ProcessImageInput
  resolve: (value: ProcessedImage) => void
  reject: (error: unknown) => void
}

interface PoolWorker {
  worker: Worker
  busy: boolean
  currentJobId: number | null
  jobTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Minimal `worker_threads` pool for sharp image processing: keeps warm
 * workers, queues jobs in arrival order, dispatches to the first idle one.
 */
export class WorkerPool {
  private readonly workers: PoolWorker[] = []
  private readonly queue: PendingJob[] = []
  private readonly pending = new Map<number, { resolve: (v: ProcessedImage) => void; reject: (e: unknown) => void }>()
  private idCounter = 0
  private started = false
  private starting: Promise<void> | null = null
  private stopped = false

  constructor(
    private readonly size: number,
    private readonly workerFactory: () => Worker,
    private readonly jobTimeoutMs: number = JOB_TIMEOUT_MS,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return
    }
    if (this.starting !== null) {
      await this.starting
      return
    }
    this.starting = this.doStart()
    await this.starting
    this.starting = null
  }

  private async doStart(): Promise<void> {
    for (let i = 0; i < this.size; i++) {
      this.spawnWorker()
    }
    this.started = true
    log.info('Sharp process pool started', { size: this.size })
  }

  private spawnWorker(): PoolWorker {
    const worker = this.workerFactory()
    const poolWorker: PoolWorker = { worker, busy: false, currentJobId: null, jobTimer: null }
    worker.on('message', (msg: WorkerResponse) => this.onMessage(poolWorker, msg))
    worker.on('error', (err) => this.onWorkerError(poolWorker, err))
    worker.on('exit', (code) => this.onWorkerExit(poolWorker, code))
    this.workers.push(poolWorker)
    return poolWorker
  }

  /** Run a single image through the pool; worker errors re-hydrate into a `DomainError` where applicable. */
  async process(input: ProcessImageInput): Promise<ProcessedImage> {
    if (this.stopped) {
      throw new Error('process pool has been stopped')
    }
    if (!this.started) {
      await this.start()
    }
    return new Promise<ProcessedImage>((resolve, reject) => {
      this.enqueueJob(input, resolve, reject)
      this.drain()
    })
  }

  private enqueueJob(
    input: ProcessImageInput,
    resolve: (value: ProcessedImage) => void,
    reject: (error: unknown) => void,
  ): void {
    const id = ++this.idCounter
    this.queue.push({ id, input, resolve, reject })
    this.pending.set(id, { resolve, reject })
  }

  private drain(): void {
    if (!this.started) {
      return
    }
    while (this.queue.length > 0) {
      const worker = this.workers.find((w) => !w.busy)
      if (worker === undefined) {
        return
      }
      const job = this.queue.shift()!
      this.dispatch(worker, job)
    }
  }

  private dispatch(worker: PoolWorker, job: PendingJob): void {
    worker.busy = true
    worker.currentJobId = job.id
    // Unref'd so an idle pool never keeps the process alive.
    worker.jobTimer = setTimeout(() => this.onJobTimeout(worker, job.id), this.jobTimeoutMs)
    worker.jobTimer.unref()

    const request: WorkerRequest = { type: 'process', id: job.id, input: job.input }
    worker.worker.postMessage(request)
  }

  private clearJobTimer(worker: PoolWorker): void {
    if (worker.jobTimer !== null) {
      clearTimeout(worker.jobTimer)
      worker.jobTimer = null
    }
  }

  private onMessage(worker: PoolWorker, msg: WorkerResponse): void {
    if (msg?.type !== 'process:result') {
      return
    }
    const entry = this.pending.get(msg.id)
    if (entry === undefined) {
      // Stale result (e.g. job already rejected during shutdown).
      return
    }
    this.pending.delete(msg.id)
    this.clearJobTimer(worker)
    worker.busy = false
    worker.currentJobId = null

    if (msg.ok) {
      const ok = msg as WorkerOkResponse
      // Buffers arrive as `Uint8Array` across the worker boundary; re-wrap.
      const result = {
        ...ok.result,
        buffer: Buffer.isBuffer(ok.result.buffer) ? ok.result.buffer : Buffer.from(ok.result.buffer),
      }
      entry.resolve(result)
    } else {
      entry.reject(rehydrateError(msg as WorkerErrResponse))
    }
    this.drain()
  }

  private onWorkerError(worker: PoolWorker, err: unknown): void {
    log.warn('Process worker emitted an error', { err: err instanceof Error ? err.message : String(err) })
    // An errored worker must be retired, not marked idle — it cannot be trusted.
    this.retireWorker(worker, err instanceof Error ? err : new Error(String(err)))
  }

  private onWorkerExit(worker: PoolWorker, code: number): void {
    const index = this.workers.indexOf(worker)
    if (index === -1) {
      // Already retired (error/timeout path or pool stop) — nothing to do.
      return
    }
    this.workers.splice(index, 1)
    if (this.stopped) {
      return
    }
    log.warn('Process worker exited unexpectedly', { code, workerIndex: index })
    this.failInFlight(worker, new Error(`process worker exited with code ${code}`))
    this.replaceWorker()
  }

  private onJobTimeout(worker: PoolWorker, jobId: number): void {
    if (worker.currentJobId !== jobId) {
      // Job already settled; the timer just hadn't been reaped yet.
      return
    }
    log.warn('Process job timed out; recycling worker', { jobId, timeoutMs: this.jobTimeoutMs })
    this.retireWorker(worker, new Error(`process job timed out after ${this.jobTimeoutMs}ms`))
  }

  /**
   * Remove a worker for good and spawn a replacement to keep the pool at size.
   */
  private retireWorker(worker: PoolWorker, err: Error): void {
    const index = this.workers.indexOf(worker)
    if (index !== -1) {
      this.workers.splice(index, 1)
    }
    this.failInFlight(worker, err)
    void worker.worker.terminate().catch(() => {
      // Ignore — terminating an already-exited worker is harmless.
    })
    if (!this.stopped) {
      this.replaceWorker()
    }
  }

  private failInFlight(worker: PoolWorker, err: unknown): void {
    this.clearJobTimer(worker)
    if (worker.currentJobId !== null) {
      const entry = this.pending.get(worker.currentJobId)
      if (entry !== undefined) {
        this.pending.delete(worker.currentJobId)
        entry.reject(err)
      }
    }
    worker.busy = false
    worker.currentJobId = null
  }

  private replaceWorker(): void {
    this.spawnWorker()
    // Flush anything queued while the pool was short-handed.
    this.drain()
  }

  async stop(): Promise<void> {
    this.stopped = true
    // Reject queued + pending jobs first so callers see a deterministic error.
    for (const job of this.queue) {
      const entry = this.pending.get(job.id)
      if (entry !== undefined) {
        this.pending.delete(job.id)
        entry.reject(new Error('process pool is shutting down'))
      }
    }
    this.queue.length = 0
    for (const [id, entry] of this.pending) {
      this.pending.delete(id)
      entry.reject(new Error('process pool is shutting down'))
    }
    await Promise.all(
      this.workers.map(async (w) => {
        this.clearJobTimer(w)
        try {
          await w.worker.terminate()
        } catch {
          // Ignore — terminating an already-exited worker is harmless.
        }
      }),
    )
    this.workers.length = 0
    this.started = false
    log.info('Sharp process pool stopped')
  }

  stats(): ProcessPoolStats {
    return {
      size: this.workers.length,
      idle: this.workers.filter((w) => !w.busy).length,
      queued: this.queue.length,
    }
  }
}

/**
 * Re-hydrate the worker's wire-format error into a `DomainError`, else a plain `Error`.
 */
function rehydrateError(msg: WorkerErrResponse): unknown {
  return domainErrorFromWire(msg.error) ?? new Error(msg.error.message)
}

let poolPromise: Promise<WorkerPool> | null = null

/**
 * Lazily create and start the shared pool; memoised, so concurrent
 * callers share one instance.
 */
export function getProcessPool(): Promise<WorkerPool> {
  if (poolPromise !== null) {
    return poolPromise
  }
  const pool = new WorkerPool(POOL_SIZE, createWorker)
  poolPromise = pool.start().then(() => pool)
  return poolPromise
}

/**
 * Tear down the pool on shutdown. Idempotent: calling twice is a no-op.
 */
export async function stopProcessPool(): Promise<void> {
  const current = poolPromise
  poolPromise = null
  if (current === null) {
    return
  }
  try {
    const pool = await current
    await pool.stop()
  } catch (err) {
    log.warn('Error stopping process pool', { err: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Factory hook for tests: replace the default worker factory without
 * touching the module singleton. Production code never calls this.
 */
let createWorker: () => Worker = defaultCreateWorker

export function __setWorkerFactory(factory: () => Worker): void {
  createWorker = factory
}

export function __resetWorkerFactory(): void {
  createWorker = defaultCreateWorker
}

function defaultCreateWorker(): Worker {
  if (isSea()) {
    // SEA: the embedded worker bundle is eval'd with `--input-type=module`,
    // which keeps `import.meta.url` a file: URL — required by the inlined
    // sharp code's module-scope `createRequire(import.meta.url)`.
    const code = getEmbeddedAsset(SEA_PROCESS_WORKER_BUNDLE_KEY)
    if (code === null) {
      throw new Error(`Embedded worker asset missing: ${SEA_PROCESS_WORKER_BUNDLE_KEY}`)
    }
    return new Worker(code.toString('utf-8'), { eval: true, execArgv: ['--input-type=module'] })
  }
  // The worker entry is emitted by `processWorkerEntryPlugin` at a stable
  // name; resolve it relative to this module so the path survives bundling.
  const workerUrl = new URL('./process-worker.js', import.meta.url)
  return new Worker(workerUrl)
}

// Priority 0: runs after flush hooks (priority 100), alongside the DB pool close.
registerShutdownHook(stopProcessPool, 0)
