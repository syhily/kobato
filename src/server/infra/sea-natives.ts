// SEA natives bootstrap — the one piece of the single-executable runtime
// that touches disk.
//
// Everything except native packages is read straight from the SEA blob
// (see `@/server/infra/sea`). Native `.node` / `.so` files cannot be
// dlopen'ed from memory, so on first run the embedded native packages
// (sharp, sharp-ico, @napi-rs/canvas and their platform packages) are
// extracted to `<cacheDir>/natives-<manifest-hash>/node_modules/` with
// per-file sha256 verification and atomic (tmp + rename) writes. The
// prelude then points `requireExternal` at that tree via
// `KOBATO_NATIVES_DIR`.
//
// The same treatment applies to the single-file bundles that must load
// from real file URLs: the server bundle ships as the embedded
// `server/server.mjs` asset (top-level await in src/server.ts makes CJS
// output impossible) and is materialized next to the natives dir on every
// boot so the prelude can `await import()` it; the `--smoke-worker` entry
// ships as `worker/smoke-worker.cjs` and is materialized on demand by
// `materializeSmokeWorkerBundle()`.
//
// The manifest asset (`manifest.json`, generated at build time by
// scripts/sea/assets) describes every embedded file; only entries whose
// asset key starts with `node_modules/` are extracted — all other assets
// stay in the blob and are read from memory.
//
// Dependency discipline: this module runs inside the SEA prelude before
// the server graph (and its env-validated modules) is available, so it
// must only import node builtins, `@/server/infra/sea`,
// `@/shared/sea/assets` (side-effect-free constants), and type-only
// symbols — never the pino logger or the env facade (both validate env
// vars at module scope).

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Logger } from '@/server/infra/logger'

import { getEmbeddedAsset, isSea, resolveCacheDir } from '@/server/infra/sea'
import {
  SEA_MANIFEST_KEY,
  SEA_NATIVE_ASSET_PREFIX,
  SEA_SERVER_BUNDLE_KEY,
  SEA_SMOKE_WORKER_BUNDLE_KEY,
} from '@/shared/sea/assets'

const NOOP_SHIM_CONTENT = 'module.exports = require\n'

export interface SeaManifestFile {
  key: string
  path: string
  sha256: string
}

export interface SeaManifest {
  version: string
  target: string
  files: SeaManifestFile[]
}

export interface ExtractNativesOptions {
  /** Raw bytes of the embedded `manifest.json` asset. */
  manifestRaw: Buffer
  /** Base cache directory (see `resolveCacheDir`). */
  cacheDir: string
  /** Asset reader — `getEmbeddedAsset` in SEA mode, a stub in tests. */
  getAsset: (key: string) => Buffer | null
  /** Log sink — the project logger in production, a stub in tests. */
  logger?: Pick<Logger, 'info' | 'debug'>
}

export interface ExtractNativesResult {
  /** `<cacheDir>/natives-<hash>` — root of the extracted tree. */
  dir: string
  /** `<dir>/node_modules` — the value exported as `KOBATO_NATIVES_DIR`. */
  nativesDir: string
  /** Files written (or repaired) during this run. */
  extracted: number
  /** Files already on disk with a matching sha256. */
  reused: number
}

// Minimal stand-in for the project logger. The pino logger
// (`@/server/infra/logger`) transitively imports the env facade, which
// validates required env vars at module scope and exits the process when
// they are missing — the SEA prelude must instead run with zero env
// (`--version`, `--help`, `--smoke-natives` work without a database).
// Same call shape, plain JSON lines on stdout; debug lines are gated on
// logging__level=debug, mirroring the production default level of 'info'.
const log: Pick<Logger, 'info' | 'debug'> = {
  info: (message, context) => {
    process.stdout.write(`${JSON.stringify({ level: 'info', msg: message, ...context })}\n`)
  },
  debug: (message, context) => {
    if (process.env.logging__level === 'debug') {
      process.stderr.write(`${JSON.stringify({ level: 'debug', msg: message, ...context })}\n`)
    }
  },
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function readFileSha256(path: string): string | null {
  try {
    return sha256(readFileSync(path))
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseManifest(raw: Buffer): SeaManifest {
  const parsed: unknown = JSON.parse(raw.toString('utf-8'))
  if (!isRecord(parsed) || typeof parsed.version !== 'string' || typeof parsed.target !== 'string') {
    throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): expected { version, target, files }`)
  }
  if (!Array.isArray(parsed.files)) {
    throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): files must be an array`)
  }
  const files: SeaManifestFile[] = []
  for (const entry of parsed.files as unknown[]) {
    if (
      !isRecord(entry) ||
      typeof entry.key !== 'string' ||
      typeof entry.path !== 'string' ||
      typeof entry.sha256 !== 'string'
    ) {
      throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): every file needs { key, path, sha256 }`)
    }
    files.push({ key: entry.key, path: entry.path, sha256: entry.sha256 })
  }
  return { version: parsed.version, target: parsed.target, files }
}

function assertSafeRelativePath(path: string): void {
  if (path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): unsafe extraction path ${path}`)
  }
}

/**
 * Write `bytes` to `path` unless the on-disk file already matches
 * `expectedSha256`. Writes go through a temp file + atomic rename so a
 * crashed run never leaves a half-written native library behind; the file
 * is re-verified after the rename.
 */
function ensureFile(path: string, bytes: Buffer, expectedSha256: string): 'reused' | 'written' {
  if (readFileSha256(path) === expectedSha256) {
    return 'reused'
  }
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(tempPath, bytes)
    renameSync(tempPath, path)
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
  const actual = readFileSha256(path)
  if (actual !== expectedSha256) {
    throw new Error(
      `SEA natives verification failed after write: ${path} (sha256 ${actual ?? 'unreadable'} != ${expectedSha256})`,
    )
  }
  return 'written'
}

/**
 * Delete sibling `natives-*` cache dirs from previous manifest hashes.
 * Best-effort: failures are logged at debug and never fail the bootstrap.
 */
function gcStaleNativesDirs(cacheDir: string, currentDirName: string, logger: Pick<Logger, 'info' | 'debug'>): void {
  try {
    for (const entry of readdirSync(cacheDir)) {
      if (!entry.startsWith('natives-') || entry === currentDirName) {
        continue
      }
      try {
        rmSync(join(cacheDir, entry), { recursive: true, force: true })
      } catch (error) {
        logger.debug('Failed to remove stale SEA natives cache dir', {
          path: join(cacheDir, entry),
          err: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } catch (error) {
    logger.debug('Failed to list SEA natives cache dir for GC', {
      cacheDir,
      err: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Name of the extraction dir for a given raw manifest — stable bytes in,
 * stable name out (cache reuse across runs). */
function nativesDirName(manifestRaw: Buffer): string {
  return `natives-${sha256(manifestRaw).slice(0, 16)}`
}

/**
 * Extract the embedded native packages into the cache dir (idempotent).
 * Exported for tests; production code enters through `bootstrapSeaRuntime`.
 */
export function extractNatives(options: ExtractNativesOptions): ExtractNativesResult {
  const logger = options.logger ?? log
  const manifest = parseManifest(options.manifestRaw)

  const expectedTarget = `${process.platform}-${process.arch}`
  if (manifest.target !== expectedTarget) {
    throw new Error(
      `SEA manifest target mismatch: binary was built for ${manifest.target} but this machine is ${expectedTarget}`,
    )
  }

  const dirName = nativesDirName(options.manifestRaw)
  const dir = join(options.cacheDir, dirName)

  let extracted = 0
  let reused = 0
  for (const file of manifest.files) {
    // Only native packages are extracted; every other asset stays in the
    // blob and is read from memory via `getEmbeddedAsset`.
    if (!file.key.startsWith(SEA_NATIVE_ASSET_PREFIX)) {
      continue
    }
    assertSafeRelativePath(file.path)
    const bytes = options.getAsset(file.key)
    if (bytes === null) {
      throw new Error(`SEA manifest references a missing embedded asset: ${file.key}`)
    }
    const actualSha256 = sha256(bytes)
    if (actualSha256 !== file.sha256) {
      throw new Error(`SEA embedded asset checksum mismatch: ${file.key} (sha256 ${actualSha256} != ${file.sha256})`)
    }
    if (ensureFile(join(dir, file.path), bytes, file.sha256) === 'written') {
      extracted += 1
    } else {
      reused += 1
    }
  }

  // Shim that lets `requireExternal` root `createRequire` inside the
  // extracted tree (createRequire needs a filename, not a directory).
  const noopContent = Buffer.from(NOOP_SHIM_CONTENT, 'utf-8')
  ensureFile(join(dir, 'node_modules', 'noop.cjs'), noopContent, sha256(noopContent))

  gcStaleNativesDirs(options.cacheDir, dirName, logger)

  logger.info('SEA natives ready', { extracted, reused, dir })
  return { dir, nativesDir: join(dir, 'node_modules'), extracted, reused }
}

/**
 * Write an embedded single-file bundle (`server/server.mjs`,
 * `worker/smoke-worker.cjs`) next to the extracted natives and return its
 * absolute path.
 *
 * The prelude loads these bundles via `await import(<file URL>)` instead
 * of bundling them into the CJS prelude: `src/server.ts` uses top-level
 * await, which no bundler can express in CJS output. The materialized
 * file lives inside the same `natives-<manifest-hash>` dir, so it is
 * covered by the same sha256 verification (on every start), atomic
 * writes, and stale-dir GC as the native packages — a tampered or
 * half-written copy is always detected and replaced from the blob.
 */
function materializeEmbeddedBundle(manifest: SeaManifest, dir: string, key: string, fileName: string): string {
  const entry = manifest.files.find((file) => file.key === key)
  if (entry === undefined) {
    throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): missing ${key}`)
  }
  const bytes = getEmbeddedAsset(key)
  if (bytes === null) {
    throw new Error(`SEA embedded bundle asset missing: ${key}`)
  }
  const actualSha256 = sha256(bytes)
  if (actualSha256 !== entry.sha256) {
    throw new Error(`SEA embedded bundle checksum mismatch: ${key} (sha256 ${actualSha256} != ${entry.sha256})`)
  }
  const bundlePath = join(dir, fileName)
  ensureFile(bundlePath, bytes, entry.sha256)
  return bundlePath
}

/**
 * The `--smoke-worker` counterpart to the server bundle materialization
 * above: write the embedded `worker/smoke-worker.cjs` next to the natives
 * and return its absolute path. Must run AFTER `bootstrapSeaRuntime()`
 * (the natives dir it writes into is created there, and the pool's
 * workers need `KOBATO_NATIVES_DIR`). Returns `null` outside SEA mode —
 * the prelude then falls back to the sibling `smoke-worker.cjs` emitted
 * by the same tsdown run.
 */
export function materializeSmokeWorkerBundle(): string | null {
  if (!isSea()) {
    return null
  }
  const manifestRaw = getEmbeddedAsset(SEA_MANIFEST_KEY)
  if (manifestRaw === null) {
    throw new Error(`SEA manifest asset missing: ${SEA_MANIFEST_KEY}`)
  }
  const dir = join(resolveCacheDir(), nativesDirName(manifestRaw))
  return materializeEmbeddedBundle(parseManifest(manifestRaw), dir, SEA_SMOKE_WORKER_BUNDLE_KEY, 'smoke-worker.cjs')
}

/**
 * SEA prelude entry point (sync by design — it runs before the server
 * bundle is imported). Returns `null` outside SEA mode (a no-op then).
 * On success, `process.env.KOBATO_NATIVES_DIR` points at the extracted
 * node_modules tree so `requireExternal` can load native packages, and
 * the returned absolute path locates the materialized server bundle for
 * the prelude's dynamic import.
 */
export function bootstrapSeaRuntime(): string | null {
  if (!isSea()) {
    return null
  }
  const manifestRaw = getEmbeddedAsset(SEA_MANIFEST_KEY)
  if (manifestRaw === null) {
    throw new Error(`SEA manifest asset missing: ${SEA_MANIFEST_KEY}`)
  }
  const result = extractNatives({ manifestRaw, cacheDir: resolveCacheDir(), getAsset: getEmbeddedAsset })
  process.env.KOBATO_NATIVES_DIR = result.nativesDir
  return materializeEmbeddedBundle(parseManifest(manifestRaw), result.dir, SEA_SERVER_BUNDLE_KEY, 'server.mjs')
}
