import type { Logger } from '@kobato/server/infra/logger'

import { SEA_MANIFEST_KEY, SEA_NATIVE_ASSET_PREFIX, type SeaAssetCodec } from '@kobato/base/distribution/sea-assets'
import { getEmbeddedAsset, isSea, resolveCacheDir } from '@kobato/server/infra/sea/sea'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface SeaManifestFile {
  key: string
  path: string
  sha256: string
  codec?: SeaAssetCodec
  size?: number
}

export interface SeaManifest {
  version: string
  target: string
  files: SeaManifestFile[]
}

export interface ExtractNativesOptions {
  manifestRaw: Buffer
  cacheDir: string
  getAsset: (key: string) => Buffer | null
  logger?: Pick<Logger, 'info' | 'debug'>
}

export interface ExtractNativesResult {
  dir: string
  nativesDir: string
  extracted: number
  reused: number
}

const log: Pick<Logger, 'info' | 'debug'> = {
  info: (message, context) => {
    process.stdout.write(`${JSON.stringify({ level: 'info', msg: message, ...context })}\n`)
  },
  debug: (message, context) => {
    if (process.env.server__loggingLevel === 'debug') {
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
    throw new TypeError(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): files must be an array`)
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
    const file: SeaManifestFile = { key: entry.key, path: entry.path, sha256: entry.sha256 }
    if (entry.codec === 'zstd' || entry.codec === 'none') {
      file.codec = entry.codec
    }
    if (typeof entry.size === 'number') {
      file.size = entry.size
    }
    files.push(file)
  }
  return { version: parsed.version, target: parsed.target, files }
}

function assertSafeRelativePath(path: string): void {
  if (path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): unsafe extraction path ${path}`)
  }
}

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

function nativesDirName(manifestRaw: Buffer): string {
  return `natives-${sha256(manifestRaw).slice(0, 16)}`
}

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
    if (!file.key.startsWith(SEA_NATIVE_ASSET_PREFIX)) {
      continue
    }
    const relativePath = file.key.slice(SEA_NATIVE_ASSET_PREFIX.length)
    assertSafeRelativePath(relativePath)
    const bytes = options.getAsset(file.key)
    if (bytes === null) {
      throw new Error(`SEA manifest references a missing embedded asset: ${file.key}`)
    }
    const actualSha256 = sha256(bytes)
    if (actualSha256 !== file.sha256) {
      throw new Error(`SEA embedded asset checksum mismatch: ${file.key} (sha256 ${actualSha256} != ${file.sha256})`)
    }
    if (ensureFile(join(dir, relativePath), bytes, file.sha256) === 'written') {
      extracted += 1
    } else {
      reused += 1
    }
  }

  gcStaleNativesDirs(options.cacheDir, dirName, logger)

  logger.info('SEA natives ready', { extracted, reused, dir })
  return { dir, nativesDir: dir, extracted, reused }
}

export function bootstrapSeaRuntime(): void {
  if (!isSea()) {
    return
  }
  const manifestRaw = getEmbeddedAsset(SEA_MANIFEST_KEY)
  if (manifestRaw === null) {
    throw new Error(`SEA manifest asset missing: ${SEA_MANIFEST_KEY}`)
  }
  const result = extractNatives({ manifestRaw, cacheDir: resolveCacheDir(), getAsset: getEmbeddedAsset })
  process.env.KOBATO_NATIVES_DIR = result.nativesDir
}
