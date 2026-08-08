import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { getLogger } from '@/server/infra/logger'
import { resolveLocalPath } from '@/server/infra/storage/backends/local'

/**
 * Shared storage resolution + response assembly for the public file routes;
 * callers own URL gates and content-type mapping, this owns filesystem
 * errors plus byte-range, ETag, and immutable-cache handling.
 */

// Both consumers serve content-addressed assets (timestamped keys / sha256 names) — one-year immutable.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/**
 * Bridge a Node `fs.createReadStream` into a DOM `ReadableStream`; Node's
 * `stream/web` type is incompatible with the DOM lib `Response` expects.
 */
export function nodeStreamToWeb(stream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      stream.on('end', () => controller.close())
      stream.on('error', (error) => controller.error(error))
    },
    cancel() {
      stream.destroy()
    },
  })
}

export interface ByteRange {
  start: number
  end: number // inclusive
  total: number
}

/** Parse a single-range `Range: bytes=start-end` header (`null` if absent/unsupported). */
export function parseRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (header === undefined || !header.startsWith('bytes=')) {
    return null
  }
  const spec = header.slice(6).trim()
  if (spec.includes(',')) {
    // Multi-range isn't supported — let the client re-request a single range.
    return null
  }
  const [startRaw, endRaw] = spec.split('-')
  let start: number
  let end: number
  if (startRaw === '') {
    // Suffix range: last N bytes.
    const n = Number.parseInt(endRaw, 10)
    if (!Number.isFinite(n) || n <= 0) {
      return 'unsatisfiable'
    }
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number.parseInt(startRaw, 10)
    end = endRaw === '' ? size - 1 : Number.parseInt(endRaw, 10)
    if (!Number.isFinite(start) || (!Number.isFinite(end) && endRaw !== '')) {
      return null
    }
  }
  if (start < 0 || start >= size || end < start) {
    return 'unsatisfiable'
  }
  return { start, end: Math.min(end, size - 1), total: size }
}

export interface LocalFileResponseInput {
  /** Absolute filesystem path, already resolved and gated by the caller. */
  absPath: string
  size: number
  mtimeMs: number
  contentType: string
  cacheControl: string
  ifNoneMatch: string | undefined
  range: string | undefined
}

interface StoredLocalFileInput {
  key: string
  contentType: string
  cacheControl: string
  headers: {
    ifNoneMatch: string | undefined
    range: string | undefined
  }
  logName: {
    scope: string
    target: string
  }
}

export async function serveStoredLocalFile(input: StoredLocalFileInput): Promise<Response> {
  let absPath: string
  try {
    absPath = resolveLocalPath(input.key)
  } catch {
    return new Response(null, { status: 400 })
  }

  try {
    const file = await stat(absPath)
    if (!file.isFile()) {
      return new Response(null, { status: 404 })
    }
    return respondWithLocalFile({
      absPath,
      size: file.size,
      mtimeMs: Math.floor(file.mtimeMs),
      contentType: input.contentType,
      cacheControl: input.cacheControl,
      ...input.headers,
    })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new Response(null, { status: 404 })
    }
    getLogger(input.logName.scope).warn(`Failed to stat ${input.logName.target}`, {
      key: input.key,
      error: String(error),
    })
    return new Response(null, { status: 500 })
  }
}

/** Full GET response for a stat'ed file: 304 / 416 / 206 / 200 with the streamed body. */
export function respondWithLocalFile(input: LocalFileResponseInput): Response {
  const { absPath, size, mtimeMs, contentType, cacheControl, ifNoneMatch } = input
  const etag = `"${size}-${mtimeMs}"`
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    ETag: etag,
    AcceptRanges: 'bytes',
    // Uploads are magic-byte validated on write, but pin the type against extension-mismatched HTML/script.
    'X-Content-Type-Options': 'nosniff',
  }

  if (ifNoneMatch !== undefined && (ifNoneMatch === etag || ifNoneMatch === '*')) {
    return new Response(null, { status: 304, headers: baseHeaders })
  }

  const range = parseRange(input.range, size)
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
    })
  }

  if (range !== null) {
    const { start, end, total } = range
    const stream = createReadStream(absPath, { start, end })
    const length = end - start + 1
    return new Response(nodeStreamToWeb(stream), {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(length),
        'Content-Range': `bytes ${start}-${end}/${total}`,
      },
    })
  }

  const stream = createReadStream(absPath)
  return new Response(nodeStreamToWeb(stream), {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(size) },
  })
}
