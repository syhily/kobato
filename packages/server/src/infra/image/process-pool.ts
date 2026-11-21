import type {
  ProcessImageInput,
  ProcessedImage,
  WorkerErrResponse,
  WorkerOkResponse,
  WorkerRequest,
  WorkerResponse,
} from '@kobato/server/infra/image/process-worker'
import type { Span } from '@kobato/server/infra/trace/facade'
import type { ImageOperation, ImageSizeBucket } from '@kobato/server/infra/trace/sanitize'

import { SEA_PROCESS_WORKER_BUNDLE_KEY } from '@kobato/distribution/sea-assets'
import { domainErrorFromWire } from '@kobato/server/infra/http/errors'
import { registerShutdownHook } from '@kobato/server/infra/lifecycle'
import { getLogger } from '@kobato/server/infra/logger'
import { isSea, getEmbeddedAsset, seaAssetPath } from '@kobato/server/infra/sea/sea'
import { startSpan } from '@kobato/server/infra/trace/facade'
import { imageSizeBucket, recordImageExecution, recordImageQueue } from '@kobato/server/infra/trace/metrics'
import { existsSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'

const log = getLogger('image:process-pool')

/**
 * Cap the Node worker count — libvips is already multi-threaded internally,
 * so one or two workers keep the request thread responsive without
 * saturating CPU.
 */
export const POOL_SIZE = Math.min(4, Math.max(1, availableParallelism()))

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
  operation: ImageOperation
  sizeBucket: ImageSizeBucket
  span: Span
  enqueuedAt: number
  dispatchedAt: number | null
  queueRecorded: boolean
  settled: boolean
}

interface PoolWorker {
  worker: Worker
  busy: boolean
  currentJobId: number | null
  jobTimer: ReturnType<typeof setTimeout> | null
}

export class WorkerPool {
  private readonly workers: PoolWorker[] = []
  private readonly queue: PendingJob[] = []
  private readonly pending = new Map<number, PendingJob>()
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

  async process(input: ProcessImageInput, operation: ImageOperation = 'unspecified'): Promise<ProcessedImage> {
    if (this.stopped) {
      throw new Error('process pool has been stopped')
    }
    if (!this.started) {
      await this.start()
    }
    return new Promise<ProcessedImage>((resolve, reject) => {
      this.enqueueJob(input, operation, resolve, reject)
      this.drain()
    })
  }

  private enqueueJob(
    input: ProcessImageInput,
    operation: ImageOperation,
    resolve: (value: ProcessedImage) => void,
    reject: (error: unknown) => void,
  ): void {
    const id = ++this.idCounter
    const sizeBucket = imageSizeBucket(input.buffer.byteLength)
    const span = startSpan('image.worker', {
      attributes: { 'image.operation': operation, 'image.size_bucket': sizeBucket },
    })
    const job: PendingJob = {
      id,
      input,
      resolve,
      reject,
      operation,
      sizeBucket,
      span,
      enqueuedAt: performance.now(),
      dispatchedAt: null,
      queueRecorded: false,
      settled: false,
    }
    this.queue.push(job)
    this.pending.set(id, job)
  }

  private recordQueueWait(job: PendingJob): void {
    if (job.queueRecorded) {
      return
    }
    job.queueRecorded = true
    recordImageQueue(job.operation, job.sizeBucket, performance.now() - job.enqueuedAt)
  }

  private settleTelemetry(job: PendingJob, outcome: 'success' | 'error'): void {
    if (job.settled) {
      return
    }
    job.settled = true
    this.recordQueueWait(job)
    if (job.dispatchedAt !== null) {
      recordImageExecution(job.operation, job.sizeBucket, performance.now() - job.dispatchedAt, outcome)
    }
    job.span.setAttribute('image.outcome', outcome)
    job.span.setStatus(outcome === 'success' ? 'ok' : 'error')
    job.span.end()
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
    job.dispatchedAt = performance.now()
    this.recordQueueWait(job)
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
      return
    }
    this.pending.delete(msg.id)
    this.clearJobTimer(worker)
    worker.busy = false
    worker.currentJobId = null

    if (msg.ok) {
      const ok = msg as WorkerOkResponse
      const result = {
        ...ok.result,
        buffer: Buffer.isBuffer(ok.result.buffer) ? ok.result.buffer : Buffer.from(ok.result.buffer),
      }
      this.settleTelemetry(entry, 'success')
      entry.resolve(result)
    } else {
      this.settleTelemetry(entry, 'error')
      entry.reject(rehydrateError(msg as WorkerErrResponse))
    }
    this.drain()
  }

  private onWorkerError(worker: PoolWorker, err: unknown): void {
    log.warn('Process worker emitted an error', { err: err instanceof Error ? err.message : String(err) })
    this.retireWorker(worker, err instanceof Error ? err : new Error(String(err)))
  }

  private onWorkerExit(worker: PoolWorker, code: number): void {
    const index = this.workers.indexOf(worker)
    if (index === -1) {
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
      return
    }
    log.warn('Process job timed out; recycling worker', { jobId, timeoutMs: this.jobTimeoutMs })
    this.retireWorker(worker, new Error(`process job timed out after ${this.jobTimeoutMs}ms`))
  }

  private retireWorker(worker: PoolWorker, err: Error): void {
    const index = this.workers.indexOf(worker)
    if (index !== -1) {
      this.workers.splice(index, 1)
    }
    this.failInFlight(worker, err)
    void worker.worker.terminate().catch(() => undefined)
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
        this.settleTelemetry(entry, 'error')
        entry.reject(err)
      }
    }
    worker.busy = false
    worker.currentJobId = null
  }

  private replaceWorker(): void {
    this.spawnWorker()
    this.drain()
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const job of this.queue) {
      const entry = this.pending.get(job.id)
      if (entry !== undefined) {
        this.pending.delete(job.id)
        this.settleTelemetry(entry, 'error')
        entry.reject(new Error('process pool is shutting down'))
      }
    }
    this.queue.length = 0
    for (const [id, entry] of this.pending) {
      this.pending.delete(id)
      this.settleTelemetry(entry, 'error')
      entry.reject(new Error('process pool is shutting down'))
    }
    await Promise.all(
      this.workers.map(async (w) => {
        this.clearJobTimer(w)
        try {
          await w.worker.terminate()
        } catch {}
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

function rehydrateError(msg: WorkerErrResponse): unknown {
  return domainErrorFromWire(msg.error) ?? new Error(msg.error.message)
}

let poolPromise: Promise<WorkerPool> | null = null

export function getProcessPool(): Promise<WorkerPool> {
  if (poolPromise !== null) {
    return poolPromise
  }
  const pool = new WorkerPool(POOL_SIZE, createWorker)
  poolPromise = pool.start().then(() => pool)
  return poolPromise
}

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

let createWorker: () => Worker = defaultCreateWorker

export function __setWorkerFactory(factory: () => Worker): void {
  createWorker = factory
}

export function __resetWorkerFactory(): void {
  createWorker = defaultCreateWorker
}

function defaultCreateWorker(): Worker {
  if (isSea()) {
    // SEA: the worker bundle is eval'd with `--input-type=module` — workers
    // cannot start from (or even see) VFS paths, so eval dispatch stays. The
    // eval keeps `import.meta.url` a file: URL — required by the inlined
    // sharp code's module-scope `createRequire(import.meta.url)`.
    //
    // Reading the bundle: main thread → plain fs from the mounted VFS. A
    // worker thread (the `--smoke-worker` entry spawns NESTED pool workers)
    // has no view of the mount, so it falls back to the `node:sea` blob
    // channel, which works in any isolate.
    const bundlePath = seaAssetPath(SEA_PROCESS_WORKER_BUNDLE_KEY)
    const code =
      bundlePath !== null
        ? readFileSync(bundlePath, 'utf-8')
        : getEmbeddedAsset(SEA_PROCESS_WORKER_BUNDLE_KEY)?.toString('utf-8')
    if (code === undefined) {
      throw new Error(`Embedded worker asset missing: ${SEA_PROCESS_WORKER_BUNDLE_KEY}`)
    }
    return new Worker(code, { eval: true, execArgv: ['--input-type=module'] })
  }
  const candidates = [new URL('./process-worker.js', import.meta.url), new URL('../process-worker.js', import.meta.url)]
  if (process.argv[1]) {
    candidates.push(pathToFileURL(join(dirname(process.argv[1]), 'process-worker.js')))
  }
  const workerUrl = candidates.find((url) => existsSync(url)) ?? candidates[0]
  return new Worker(workerUrl)
}

registerShutdownHook(stopProcessPool, 0)
