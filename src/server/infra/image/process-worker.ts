import { parentPort, workerData } from 'node:worker_threads'
import sharp from 'sharp'

// Relative import (not `@/shared/...`) so the worker is fully
// self-contained: Node's `worker_threads` loads it directly in tests via
// `--experimental-strip-types` without a path-alias resolver, and the
// production bundle (emitted by `processWorkerEntryPlugin`) inlines the
// thumbhash code without pulling in the rest of the app graph.
import { rgbaToThumbHash } from '../../../shared/utils/thumbhash.ts'

const THUMBHASH_MAX_DIMENSION = 100
const MAX_INPUT_PIXELS = 16384 * 16384

export interface ProcessImageResize {
  width: number
  height: number
  fit?: 'cover' | 'contain' | 'inside' | 'outside' | 'fill'
}

export interface ProcessImageInput {
  buffer: Buffer
  jpegQuality: number
  resize?: ProcessImageResize
}

export interface ProcessedImage {
  buffer: Buffer
  width: number
  height: number
  byteSize: number
  thumbhash: string
}

/**
 * Wire format for messages exchanged between the pool and its workers.
 * Errors are flattened into a plain object because `DomainError` (and its
 * prototype chain) does not survive the structured-clone boundary.
 */
export interface WorkerRequest {
  type: 'process'
  id: number
  input: ProcessImageInput
}

export interface WorkerOkResponse {
  type: 'process:result'
  id: number
  ok: true
  result: ProcessedImage
}

export interface WorkerErrResponse {
  type: 'process:result'
  id: number
  ok: false
  error: { name: string; code?: string; message: string; issues?: { message: string; path?: string[] }[] }
}

export type WorkerResponse = WorkerOkResponse | WorkerErrResponse

/**
 * Lightweight stand-in for `DomainError` used inside the worker isolate.
 *
 * We deliberately avoid importing `@/server/infra/http/errors` here —
 * that module uses TypeScript parameter properties (`readonly` in the
 * constructor) which Node's `--experimental-strip-types` cannot transform,
 * and pulling it in would also bring transitive deps. The pool
 * rehydrates these into real `DomainError` instances on the main thread
 * (see `rehydrateError` in `process-pool.ts`), so callers see the exact
 * same exception type they did before the worker offload.
 *
 * The `name` is set to `'DomainError'` so the wire format matches what
 * `rehydrateError` checks for.
 */
export class WorkerDomainError extends Error {
  readonly code: string
  readonly issues?: { message: string; path?: string[] }[]

  constructor(code: string, message: string, issues?: { message: string; path?: string[] }[]) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.issues = issues
  }
}

/**
 * The pure sharp transform, lifted verbatim from the previous inline
 * `processImageBuffer`. Both the main thread (dev shortcut / inline tests)
 * and the worker entry point below call this, guaranteeing identical
 * behaviour regardless of where the work runs.
 */
export async function processImageInWorker(input: ProcessImageInput): Promise<ProcessedImage> {
  let pipeline: sharp.Sharp
  try {
    pipeline = sharp(input.buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    }).rotate()
  } catch (error) {
    throw new WorkerDomainError('BAD_REQUEST', '无法解析图片数据', [
      { message: error instanceof Error ? error.message : String(error) },
    ])
  }

  let normalisedBuffer: Buffer
  try {
    let staged = pipeline.clone()
    if (input.resize !== undefined) {
      staged = staged.resize({
        width: input.resize.width,
        height: input.resize.height,
        fit: input.resize.fit ?? 'cover',
        withoutEnlargement: false,
      })
    }
    normalisedBuffer = await staged.jpeg({ quality: input.jpegQuality, mozjpeg: true, progressive: true }).toBuffer()
  } catch (error) {
    throw new WorkerDomainError('BAD_REQUEST', '图片重新编码失败', [
      { message: error instanceof Error ? error.message : String(error) },
    ])
  }

  const normalisedMeta = await sharp(normalisedBuffer, { failOn: 'error' }).metadata()
  const width = normalisedMeta.width
  const height = normalisedMeta.height
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new WorkerDomainError('BAD_REQUEST', '图片尺寸无效')
  }

  const thumbhash = await computeThumbhash(normalisedBuffer, width, height)

  return {
    buffer: normalisedBuffer,
    width,
    height,
    byteSize: normalisedBuffer.byteLength,
    thumbhash,
  }
}

async function computeThumbhash(imageBuffer: Buffer, sourceWidth: number, sourceHeight: number): Promise<string> {
  const { width, height } = fitInside(sourceWidth, sourceHeight, THUMBHASH_MAX_DIMENSION, THUMBHASH_MAX_DIMENSION)

  const { data, info } = await sharp(imageBuffer, { failOn: 'error' })
    .resize({
      width,
      height,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const hash = rgbaToThumbHash(info.width, info.height, data)
  return Buffer.from(hash).toString('base64')
}

function fitInside(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  return { width: targetWidth, height: targetHeight }
}

// ─── Worker entry point ───────────────────────────────────
//
// Only active when this module is loaded as a worker_thread target.
// When imported directly (dev shortcut, tests), `parentPort` is undefined
// and the listener below is never registered.

if (parentPort !== null) {
  const port = parentPort
  void workerData // present for future per-worker config; unused today

  port.on('message', (msg: WorkerRequest) => {
    if (msg?.type !== 'process') {
      return
    }
    void handle(msg)
      .then((response) => port.postMessage(response))
      .catch((err: unknown) => {
        // Should be unreachable: handle() always resolves with a response.
        port.postMessage({
          type: 'process:result',
          id: msg.id,
          ok: false,
          error: {
            name: err instanceof Error ? err.name : 'Error',
            message: err instanceof Error ? err.message : String(err),
          },
        } satisfies WorkerErrResponse)
      })
  })
}

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  try {
    const result = await processImageInWorker(req.input)
    return {
      type: 'process:result',
      id: req.id,
      ok: true,
      result,
    } satisfies WorkerOkResponse
  } catch (err) {
    if (err instanceof WorkerDomainError) {
      return {
        type: 'process:result',
        id: req.id,
        ok: false,
        error: {
          name: err.name,
          code: err.code,
          message: err.message,
          issues: err.issues,
        },
      } satisfies WorkerErrResponse
    }
    return {
      type: 'process:result',
      id: req.id,
      ok: false,
      error: {
        name: err instanceof Error ? err.name : 'Error',
        message: err instanceof Error ? err.message : String(err),
      },
    } satisfies WorkerErrResponse
  }
}
