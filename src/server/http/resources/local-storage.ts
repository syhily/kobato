import { Hono } from 'hono'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import type { Env } from '@/server/http/context'

import { getLogger } from '@/server/infra/logger'
import { resolveLocalPath } from '@/server/infra/storage/backends/local'

const log = getLogger('storage.local.http')

export const localStorageRouter = new Hono<Env>()

// Only these namespaces are reachable through the unauthenticated public
// route — the media the site actually embeds. Everything else written under
// STORAGE_DIR (most critically `backup/backup-<ts>.sql.gz`, which is a full
// `pg_dump` of password hashes / sessions / PII) MUST stay private.
//
// This is a positive allowlist, not a denylist, on purpose: a namespace
// added later defaults to *not* being publicly served, so a future private
// prefix can't leak just because nobody remembered to denylist it. The
// traversal guard in `resolveLocalPath` is not enough on its own — it only
// prevents escaping STORAGE_DIR, it does not restrict *which* subdirectory
// inside it is readable.
const PUBLIC_STORAGE_PREFIXES = ['images/', 'musics/', 'branding/', 'fonts/']

/**
 * Whether a decoded key names a publicly-servable object. Rejects empty
 * keys, dotfiles, and any path containing a hidden segment (`.env`,
 * `backup/.htaccess`, …) so even an allowlisted namespace can't expose a
 * sensitive hidden file an operator may have dropped alongside uploads.
 */
function isPublicStorageKey(key: string): boolean {
  if (key === '') {
    return false
  }
  for (const segment of key.split('/')) {
    if (segment === '' || segment.startsWith('.')) {
      return false
    }
  }
  return PUBLIC_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

// Local-served assets are content-addressed (timestamped image keys, random
// music player ids) and the URL carries a `?v=` cache buster on every
// re-upload, so we can safely mark them immutable.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
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
 * `Response` body. The project builds web streams by hand (see
 * `analytics.ts`) rather than `Readable.toWeb`, because Node's
 * `stream/web` `ReadableStream` is structurally incompatible with the DOM
 * lib type `Response` expects.
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

localStorageRouter.get('/storage/*', async (c) => {
  // `c.req.path` is already path-normalised by the router; slice the prefix
  // and percent-decode so non-ASCII filenames resolve. The local backend's
  // `resolveLocalPath` re-applies the `isPathInside` traversal guard.
  let key: string
  try {
    key = decodeURIComponent(c.req.path.slice('/storage/'.length))
  } catch {
    return c.body(null, 400)
  }
  // Gate before resolving: backups and any non-public namespace must 404
  // here, never reaching the filesystem. A 404 (not 403) avoids confirming
  // to an attacker that a private object exists.
  if (!isPublicStorageKey(key)) {
    return c.body(null, 404)
  }

  let abs: string
  try {
    abs = resolveLocalPath(key)
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
    log.warn('Failed to stat local object', { key, error: String(error) })
    return c.body(null, 500)
  }

  const etag = `"${size}-${mtimeMs}"`
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentTypeFor(key),
    'Cache-Control': IMMUTABLE_CACHE_CONTROL,
    ETag: etag,
    AcceptRanges: 'bytes',
    // Prevent MIME sniffing: uploads are content-validated (magic bytes)
    // on write, but pinning the type defends against a mismatched-extension
    // file ever being interpreted as HTML/script by the browser.
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
