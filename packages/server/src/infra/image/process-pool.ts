import type {
  ProcessImageInput,
  ProcessedImage,
  WorkerErrResponse,
  WorkerOkResponse,
  WorkerRequest,
  WorkerResponse,
} from '@kobato/server/infra/image/process-worker'

import { domainErrorFromWire } from '@kobato/server/infra/http/errors'
import { registerShutdownHook } from '@kobato/server/infra/lifecycle'
import { getLogger } from '@kobato/server/infra/logger'
import { getEmbeddedAsset, isSea } from '@kobato/server/infra/sea'
import { SEA_PROCESS_WORKER_BUNDLE_KEY } from '@kobato/shared/sea/assets'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'

const log = getLogger('image:process-pool')

/**
 * How many sharp workers to keep warm. Sharp itself is already
 * multi-threaded internally (libvips spawns a thread pool), so we cap the
 * *Node* worker count conservatively — one or two are usually enough to
 * keep the request thread responsive without saturating CPU on a small
 * box. `availableParallelism` is the upper bound; the minimum is 1.
 */
export const POOL_SIZE = Math.min(4, Math.max(1, availableParallelism()))

/**
 * Upper bound for a single in-flight job. A message posted to a worker
 * that has already died is silently dropped (no `error` event, no
 * rejection), so without a deadline such a job would hang forever. On
 * timeout the job is rejected and the worker is recycled.
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
 * A minimal `worker_threads` pool for sharp image processing.
 *
 * The pool keeps `POOL_SIZE` workers warm and dispatches jobs to the
 * first idle worker. When every worker is busy, jobs queue in arrival
 * order and are flushed as workers go idle.
 *
 * Not a general-purpose job queue — it exists solely to move the
 * decode/resize/re-encode/thumbhash pipeline off the request thread so
 * a slow upload cannot stall public SSR, other API calls, or WebSocket
 * heartbeats.
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

  /**
   * Run a single image through the pool. Resolves with the processed
   * image or rejects with whatever error the worker raised (re-hydrated
   * into a `DomainError` where applicable).
   */
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
    // Unref'd so an idle pool never keeps the process alive on a deadline
    // alone; the timer is cleared as soon as the job settles.
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
      // `Buffer` instances arrive as plain `Uint8Array` after structured-
      // clone across the worker boundary. Re-wrap so callers see a real
      // `Buffer` (they may call `.toString('hex')`, `.toString('base64')`,
      // etc., which `Uint8Array` does not support).
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
    // A worker that emitted an error can no longer be trusted (Node
    // typically follows `error` with `exit`); retire it instead of marking
    // it idle, or queued jobs would be dispatched to a dead worker and
    // silently dropped.
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
   * Remove a worker from the pool for good: reject its in-flight job,
   * terminate the thread (harmless if it already exited), and spawn a
   * replacement so the pool keeps its configured size.
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
    // The fresh worker is idle — flush anything queued while the pool was
    // short-handed.
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
 * Turn the wire-format error object back into a `DomainError` when the
 * worker reported one (see `domainErrorFromWire`), otherwise fall back to
 * a plain `Error` carrying just the message.
 */
function rehydrateError(msg: WorkerErrResponse): unknown {
  return domainErrorFromWire(msg.error) ?? new Error(msg.error.message)
}

// ─── Module singleton ─────────────────────────────────────

let poolPromise: Promise<WorkerPool> | null = null

/**
 * Lazily create (and start) the shared sharp process pool. The first
 * caller pays the worker spawn cost; subsequent callers reuse the warm
 * pool. Safe to call concurrently — the promise is memoised.
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
    // Single-executable build: the worker bundle is embedded as a text
    // asset and started with `eval: true`. `--input-type=module` makes
    // the eval'd ESM bundle run as a module EXPLICITLY (no syntax
    // detection) and keeps `import.meta.url` a file: URL, which the
    // module-scope `createRequire(import.meta.url)` sites in the inlined
    // sharp code require. Worker threads share the parent process
    // environment, so the worker's redirected native loads
    // (`nativeRequire`) resolve via `KOBATO_NATIVES_DIR` without
    // workerData plumbing.
    const code = getEmbeddedAsset(SEA_PROCESS_WORKER_BUNDLE_KEY)
    if (code === null) {
      throw new Error(`Embedded worker asset missing: ${SEA_PROCESS_WORKER_BUNDLE_KEY}`)
    }
    return new Worker(code.toString('utf-8'), { eval: true, execArgv: ['--input-type=module'] })
  }
  // In production the worker entry is emitted by `processWorkerEntryPlugin`
  // at `<server-build-dir>/assets/process-worker.js` (stable name, no hash).
  // We resolve it relative to the bundled module's own URL so the path is
  // correct regardless of which chunk the pool lands in.
  //
  // Dev never reaches here — the dev shortcut in `process.ts` runs the
  // pipeline inline, avoiding Node worker `.ts` loading limitations.
  const workerUrl = new URL('./process-worker.js', import.meta.url)
  return new Worker(workerUrl)
}

// Register the pool teardown as a shutdown hook. Priority 0 (default)
// runs after flush hooks (priority 100) but alongside other
// connection-close hooks (the DB pool). The pool rejects in-flight jobs
// deterministically, so no data is lost — callers see an error and the
// request fails fast.
registerShutdownHook(stopProcessPool, 0)
