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

// Reject ASCII control characters (NUL–US, DEL) anywhere in a key.
// eslint-disable-next-line no-control-regex -- intentional security guard
const UNSAFE_KEY_CHARS = /[\x00-\x1f\x7f]/

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
 * escapes (absolute keys, `..`, control chars). Shared by `/storage/*` and migration.
 */
export function resolveLocalPath(key: string): string {
  if (key === '' || key.startsWith('/') || UNSAFE_KEY_CHARS.test(key)) {
    throw new ActionFailure(400, `非法的存储路径: ${key}`)
  }
  // `path.resolve` normalises `..` — hence the `isPathInside` re-check.
  const abs = path.resolve(STORAGE_DIR, key)
  if (!isPathInside(abs, STORAGE_DIR)) {
    throw new ActionFailure(400, `非法的存储路径: ${key}`)
  }
  return abs
}

/**
 * Write via a sibling temp file + atomic rename: readers never see a partial
 * file. Temp lives in the same directory so the rename stays on one filesystem.
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
 * Local-filesystem backend under `$DATA_PATH/storage/<key>`, same key namespace
 * as S3 (migration is a verbatim copy). Always available — the S3 fallback.
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
    // A directory key is not a readable object — surface the seam's not-found instead of EISDIR.
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
    // Reference the object directly: `this` is lost when the method is destructured.
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
    // Sort before slicing so `maxKeys` is a deterministic prefix (matches S3's lexicographic order).
    const walked = await walk(base, STORAGE_DIR)
    const items = walked.sort((a, b) => a.key.localeCompare(b.key))
    return opts?.maxKeys !== undefined ? items.slice(0, opts.maxKeys) : items
  },
}
