import { Hono } from 'hono'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import type { Env } from '@/server/http/context'

import { getLogger } from '@/server/infra/logger'
import { resolveLocalPath } from '@/server/infra/storage/backends/local'

const log = getLogger('fonts.embedded.http')

/**
 * Dedicated public route for self-hosted web-font packages served from local
 * storage. Unlike the generic `/storage/*` route, this maps the URL pattern
 * `/fonts/embedded/<hash>/<filename>` to the storage key `fonts/<hash>/<filename>`
 * and serves the corresponding file from `$DATA_PATH/storage/`.
 *
 * Font packages are content-addressed (the `<hash>` is the sha256 of the
 * source TTF/OTF), so all responses are marked immutable with a one-year
 * cache lifetime.
 */
export const fontsEmbeddedRouter = new Hono<Env>()

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

function contentTypeFor(key: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Bridge a Node `fs.createReadStream` into a DOM `ReadableStream` for the
 * `Response` body. Mirrors the identical helper in `local-storage.ts`.
 */
function nodeStreamToWeb(stream: Readable): ReadableStream<Uint8Array> {
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

interface ByteRange {
  start: number
  end: number // inclusive
  total: number
}

/** Parse a single-range `Range: bytes=start-end` header (`null` if absent/unsupported). */
function parseRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (header === undefined || !header.startsWith('bytes=')) {
    return null
  }
  const spec = header.slice(6).trim()
  if (spec.includes(',')) {
    return null
  }
  const [startRaw, endRaw] = spec.split('-')
  let start: number
  let end: number
  if (startRaw === '') {
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

/**
 * Extract the hash and filename from a `/fonts/embedded/<hash>/<filename>`
 * URL path. Returns `null` when the path does not match the expected pattern.
 *
 * The hash must be exactly 64 lowercase hex characters (sha256). Any path
 * containing a hidden segment or dotfile prefix is rejected.
 */
function parseEmbeddedFontPath(urlPath: string): { hash: string; filename: string } | null {
  // urlPath looks like: /fonts/embedded/abc123.../result.css
  // or:                /fonts/embedded/abc123.../chunk-001.woff2
  const prefix = '/fonts/embedded/'
  if (!urlPath.startsWith(prefix)) {
    return null
  }
  const rest = urlPath.slice(prefix.length)
  if (rest === '' || rest.startsWith('/')) {
    return null
  }
  const slashIdx = rest.indexOf('/')
  if (slashIdx === -1) {
    return null
  }
  const hash = rest.slice(0, slashIdx)
  const filename = rest.slice(slashIdx + 1)

  // Validate hash: must be 64 lowercase hex chars.
  if (hash.length !== 64 || !/^[0-9a-f]{64}$/.test(hash)) {
    return null
  }
  // Reject empty filenames, dotfiles, and hidden segments anywhere in the
  // remaining path (defence-in-depth alongside resolveLocalPath).
  if (filename === '') {
    return null
  }
  for (const segment of filename.split('/')) {
    if (segment === '' || segment.startsWith('.')) {
      return null
    }
  }
  return { hash, filename }
}

fontsEmbeddedRouter.get('/fonts/embedded/*', async (c) => {
  const parsed = parseEmbeddedFontPath(c.req.path)
  if (parsed === null) {
    return c.body(null, 400)
  }

  const storageKey = `fonts/${parsed.hash}/${parsed.filename}`

  let abs: string
  try {
    abs = resolveLocalPath(storageKey)
  } catch {
    return c.body(null, 400)
  }

  let size: number
  let mtimeMs: number
  try {
    const st = await stat(abs)
    if (!st.isFile()) {
      return c.body(null, 404)
    }
    size = st.size
    mtimeMs = Math.floor(st.mtimeMs)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return c.body(null, 404)
    }
    log.warn('Failed to stat embedded font file', {
      key: storageKey,
      error: String(error),
    })
    return c.body(null, 500)
  }

  const etag = `"${size}-${mtimeMs}"`
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentTypeFor(storageKey),
    'Cache-Control': IMMUTABLE_CACHE_CONTROL,
    ETag: etag,
    AcceptRanges: 'bytes',
    'X-Content-Type-Options': 'nosniff',
  }

  const inm = c.req.header('if-none-match')
  if (inm !== undefined && (inm === etag || inm === '*')) {
    return new Response(null, { status: 304, headers: baseHeaders })
  }

  const range = parseRange(c.req.header('range'), size)
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
    })
  }

  if (range !== null) {
    const { start, end, total } = range
    const stream = createReadStream(abs, { start, end })
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

  const stream = createReadStream(abs)
  return new Response(nodeStreamToWeb(stream), {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(size) },
  })
})
