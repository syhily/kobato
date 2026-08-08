import type { Metadata, Sharp } from 'sharp'

import { parentPort, workerData } from 'node:worker_threads'
import sharp from 'sharp'

import type { DomainErrorWire } from '@/server/infra/http/errors'

// Relative import — the worker loads without a path-alias resolver.
import { rgbaToThumbHash } from '../../../shared/utils/thumbhash.ts'

// sharp must stay a static import: the bundler redirects its platform loads
// to `nativeRequire` (`scripts/sea/redirect-native-requires.ts`).

const THUMBHASH_MAX_DIMENSION = 100
// Decoded-pixel ceiling (~200 MB RGBA) — caller caps bound encoded bytes
// only, so this guards against decompression bombs.
const MAX_INPUT_PIXELS = 50_000_000

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
 * Wire format for pool↔worker messages; errors are flattened because
 * class instances don't survive structured clone.
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
  // Type-only reference: `domainErrorFromWire` must stay out of the worker's runtime graph.
  error: DomainErrorWire
}

export type WorkerResponse = WorkerOkResponse | WorkerErrResponse

/**
 * `DomainError` stand-in for the worker isolate — `name: 'DomainError'`
 * matches the wire contract. Never import `@/server/infra/http/errors`
 * here (parameter properties break `--experimental-strip-types`).
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
 * The pure sharp transform shared by the dev inline path and the worker entry point.
 */
export async function processImageInWorker(input: ProcessImageInput): Promise<ProcessedImage> {
  // Reject undecodable/oversized inputs on metadata alone, before any
  // pixels decode; `limitInputPixels` re-enforces the ceiling at decode.
  let inputMeta: Metadata
  try {
    inputMeta = await sharp(input.buffer, { failOn: 'error' }).metadata()
  } catch (error) {
    throw new WorkerDomainError('BAD_REQUEST', '无法解析图片数据', [
      { message: error instanceof Error ? error.message : String(error) },
    ])
  }
  const inputWidth = inputMeta.width ?? 0
  const inputHeight = inputMeta.height ?? 0
  if (!Number.isFinite(inputWidth) || inputWidth <= 0 || !Number.isFinite(inputHeight) || inputHeight <= 0) {
    throw new WorkerDomainError('BAD_REQUEST', '图片尺寸无效')
  }
  if (inputWidth * inputHeight > MAX_INPUT_PIXELS) {
    throw new WorkerDomainError('BAD_REQUEST', `图片尺寸过大（上限 ${MAX_INPUT_PIXELS / 1_000_000} 百万像素）`)
  }

  let pipeline: Sharp
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

// Listener registers only when loaded as a worker_thread target.

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
