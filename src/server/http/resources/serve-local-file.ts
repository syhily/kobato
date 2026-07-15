import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

/**
 * Shared response assembly for the public file-serving resource routes
 * (`local-storage.ts`, `fonts-embedded.ts`). Both gate a URL down to an
 * absolute path inside STORAGE_DIR, `stat` it themselves (their 404/500
 * logging differs), and then stream the file with byte-range, ETag, and
 * immutable-cache handling — that last part lives here so the two routes
 * can't drift apart.
 */

// Both consumers serve content-addressed assets: uploads get timestamped
// keys / random ids plus a `?v=` cache buster on re-upload, and font
// packages are named by the sha256 of the source file. Responses can
// therefore be marked immutable with a one-year cache lifetime.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/**
 * Bridge a Node `fs.createReadStream` into a DOM `ReadableStream` for the
 * `Response` body. The project builds web streams by hand (see
 * `analytics.ts`) rather than `Readable.toWeb`, because Node's
 * `stream/web` `ReadableStream` is structurally incompatible with the DOM
 * lib type `Response` expects.
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

/**
 * Assemble the full GET response for an already-stat'ed local file: 304 on
 * a matching `If-None-Match`, 416 / 206 for `Range` requests, 200 with the
 * streamed body otherwise. Stat failures stay with the caller — each route
 * logs its own 404/500.
 */
export function respondWithLocalFile(input: LocalFileResponseInput): Response {
  const { absPath, size, mtimeMs, contentType, cacheControl, ifNoneMatch } = input
  const etag = `"${size}-${mtimeMs}"`
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    ETag: etag,
    AcceptRanges: 'bytes',
    // Prevent MIME sniffing: uploads are content-validated (magic bytes)
    // on write, but pinning the type defends against a mismatched-extension
    // file ever being interpreted as HTML/script by the browser.
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
