import type { Readable } from 'node:stream'

import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { isPathInside, STORAGE_DIR } from '@/server/infra/paths'
import {
  MAX_OBJECT_BUFFER_SIZE,
  type PutObjectInput,
  type PutStreamInput,
  type StorageBackend,
  StorageObjectNotFound,
  type StoredObjectMeta,
} from '@/server/infra/storage/backend'

const log = getLogger('storage.local')

// Reject ASCII control characters (NUL through US and DEL) anywhere in a key.
// Node rejects NUL in paths at runtime, but bailing early with a clean 400 is
// friendlier and defends against crafted keys that try to confuse path parsing.
// eslint-disable-next-line no-control-regex -- intentional security guard
const UNSAFE_KEY_CHARS = /[\x00-\x1f\x7f]/

/** Safely read `.code` off a thrown value as a string (Node `fs` errors carry `ENOENT` etc.). */
function errnoCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return undefined
}

function metaFromStat(key: string, st: { size: number; mtimeMs: number; mtime: Date }): StoredObjectMeta {
  return { key, size: st.size, etag: `${st.size}-${Math.floor(st.mtimeMs)}`, lastModified: st.mtime }
}

/**
 * Resolve a backend key to an absolute path inside `STORAGE_DIR`, rejecting
 * anything that would escape it (absolute keys, `..` traversal, control
 * characters). Mirrors the guard the MaxMind reader uses (`isPathInside`).
 * Exported so the public `/storage/*` route and the migration tool reuse the
 * exact same guard instead of re-implementing it.
 */
export function resolveLocalPath(key: string): string {
  if (key === '' || key.startsWith('/') || UNSAFE_KEY_CHARS.test(key)) {
    throw new ActionFailure(400, `非法的存储路径: ${key}`)
  }
  // Collapse any `.` / `..` segments and Windows drive letters / UNC paths
  // before the containment check. `path.resolve` normalises, so an input
  // like `images/../../etc/passwd` resolves outside STORAGE_DIR and is
  // rejected by `isPathInside` below.
  const abs = path.resolve(STORAGE_DIR, key)
  if (!isPathInside(abs, STORAGE_DIR)) {
    throw new ActionFailure(400, `非法的存储路径: ${key}`)
  }
  return abs
}

/**
 * Write a buffer/stream to a sibling temp file then atomically `rename` it
 * into place. A crash or write error mid-way never leaves a partial file at
 * the target path — readers either see the previous full file or the new
 * full file, never a truncated one. The temp file lives in the same
 * directory so the rename is atomic on a single filesystem.
 */
async function atomicWrite(abs: string, write: (tmp: string) => Promise<void>): Promise<void> {
  await mkdir(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.tmp-${randomBytes(6).toString('hex')}`
  try {
    await write(tmp)
    await rename(tmp, abs)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

/** Recursive directory walk returning `StoredObjectMeta` with `/`-joined keys relative to `base`. */
async function walk(dir: string, base: string): Promise<StoredObjectMeta[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: StoredObjectMeta[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(full, base)))
    } else if (entry.isFile()) {
      const st = await stat(full)
      const rel = path.relative(base, full).split(path.sep).join('/')
      out.push(metaFromStat(rel, st))
    }
  }
  return out
}

/**
 * Local-filesystem backend. Writes under `$DATA_PATH/storage/<key>` in the
 * same key namespace as S3, so a migration is a verbatim copy. Always
 * available — it's the fallback when S3 is not configured.
 */
export const localBackend: StorageBackend = {
  driver: 'local',

  isAvailable(): boolean {
    return true
  },

  async put(input: PutObjectInput): Promise<StoredObjectMeta> {
    const abs = resolveLocalPath(input.key)
    await atomicWrite(abs, (tmp) => writeFile(tmp, input.body))
    return metaFromStat(input.key, await stat(abs))
  },

  async putStream(input: PutStreamInput): Promise<StoredObjectMeta> {
    const abs = resolveLocalPath(input.key)
    await atomicWrite(abs, (tmp) => pipeline(input.body, createWriteStream(tmp)))
    return metaFromStat(input.key, await stat(abs))
  },

  async get(key: string): Promise<Buffer> {
    const abs = resolveLocalPath(key)
    let st
    try {
      st = await stat(abs)
    } catch (error) {
      throw errnoCode(error) === 'ENOENT' ? new StorageObjectNotFound(key) : error
    }
    // A key that resolves to a directory is not a readable object — surface
    // the seam's not-found instead of letting `readFile` throw EISDIR (which
    // the HTTP layer would turn into a 500). Matches the `isFile()` guard the
    // route uses.
    if (!st.isFile()) {
      throw new StorageObjectNotFound(key)
    }
    if (st.size > MAX_OBJECT_BUFFER_SIZE) {
      throw new ActionFailure(413, `本地文件过大 (${st.size} 字节)，超出 ${MAX_OBJECT_BUFFER_SIZE} 字节限制`)
    }
    return readFile(abs)
  },

  async getStream(key: string): Promise<Readable> {
    const abs = resolveLocalPath(key)
    let st
    try {
      st = await stat(abs)
    } catch (error) {
      throw errnoCode(error) === 'ENOENT' ? new StorageObjectNotFound(key) : error
    }
    if (!st.isFile()) {
      throw new StorageObjectNotFound(key)
    }
    return createReadStream(abs)
  },

  async exists(key: string): Promise<boolean> {
    try {
      await access(resolveLocalPath(key))
      return true
    } catch {
      return false
    }
  },

  async delete(key: string): Promise<void> {
    // Best-effort: a missing object is not an error (matches the S3 delete contract).
    try {
      await unlink(resolveLocalPath(key))
    } catch (error) {
      if (errnoCode(error) !== 'ENOENT') {
        log.warn('Failed to delete local object', { key, error })
      }
    }
  },

  async deleteMany(keys: string[]): Promise<void> {
    // Reference `localBackend.delete` directly rather than `this.delete` so
    // the method stays correct when destructured off the object or passed as
    // a callback (where `this` would be lost).
    await Promise.all(keys.map((key) => localBackend.delete(key)))
  },

  async deletePrefix(prefix: string): Promise<void> {
    try {
      const dir = path.resolve(STORAGE_DIR, prefix)
      if (!isPathInside(dir, STORAGE_DIR)) {
        return
      }
      await rm(dir, { recursive: true, force: true })
    } catch (error) {
      log.warn('Failed to delete local prefix', { prefix, error })
    }
  },

  async list(prefix: string, opts?: { maxKeys?: number }): Promise<StoredObjectMeta[]> {
    const base = path.resolve(STORAGE_DIR, prefix)
    if (!isPathInside(base, STORAGE_DIR)) {
      return []
    }
    // Sort before slicing so `maxKeys` returns a deterministic prefix of the
    // listing — matching the S3 backend's lexicographic ordering.
    const walked = await walk(base, STORAGE_DIR)
    const items = walked.sort((a, b) => a.key.localeCompare(b.key))
    return opts?.maxKeys !== undefined ? items.slice(0, opts.maxKeys) : items
  },
}
