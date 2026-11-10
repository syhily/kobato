// SEA asset collection: build the embedded-asset map for `--build-sea` (see
// blob.ts) and write manifest.json, the codec/integrity registry the runtime
// reads. Asset keys come from `src/shared/sea/assets.ts` — never hardcode one.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { availableParallelism } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { constants as zlibConstants, zstdCompressSync } from 'node:zlib'

// Relative import: this script runs under plain `node` — no path aliases.
import {
  SEA_CLIENT_ASSET_PREFIX,
  SEA_DRIZZLE_ASSET_PREFIX,
  SEA_MANIFEST_KEY,
  SEA_NATIVE_ASSET_PREFIX,
  SEA_NATIVE_DUCKDB_ADDON_KEY,
  SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY,
  SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY,
  SEA_NATIVE_META_SHARP_PACKAGE_KEY,
  SEA_NATIVE_META_SHARP_VERSIONS_KEY,
  SEA_NATIVE_SHARP_ADDON_KEY,
  SEA_NATIVE_SKIA_ADDON_KEY,
  SEA_NATIVE_SKIA_ICU_KEY,
  SEA_OBSERVABILITY_ASSET_PREFIX,
  SEA_PROCESS_WORKER_BUNDLE_KEY,
  SEA_SMOKE_WORKER_BUNDLE_KEY,
  SEA_WASM_CNFS_KEY,
  type SeaAssetCodec,
} from '../../src/shared/sea/assets.ts'
import { fail, run } from './exec.ts'
import {
  repoRoot,
  seaIntermediatesDir,
  seaManifestPath,
  seaPackedAssetsDir,
  seaSmokeWorkerBundlePath,
  seaStagedNativesDir,
  seaWorkerBundlePath,
} from './paths.ts'

const requireFromRepo = createRequire(join(repoRoot, 'package.json'))

/**
 * Packing policy: only the native dynamic libraries are zstd-packed; everything
 * else rides raw — under `useVfs` each key is a plain `node:fs` read, so a
 * packed payload would be unreadable there. Natives never touch the VFS:
 * dlopen needs real files and worker threads cannot see the mount.
 */
export function shouldPackAsset(key: string): boolean {
  return key.startsWith(SEA_NATIVE_ASSET_PREFIX)
}

/** Assets below this stay uncompressed — framing + decode outweigh the savings. */
export const SEA_COMPRESSION_MIN_BYTES = 1024

/**
 * Capped at 8 — zstd's job granularity saturates beyond that. The manifest
 * hashes RAW bytes, so cross-machine packed-byte differences don't matter.
 */
const ZSTD_PACK_WORKERS = Math.min(availableParallelism(), 8)

/** Below this the thread-pool spin-up (~10 ms per call × ~250 small assets) outweighs the savings. */
const ZSTD_MULTITHREAD_MIN_BYTES = 4 * 1024 * 1024

interface ManifestFileEntry {
  key: string
  path: string
  /** sha256 of the RAW (uncompressed) bytes — runtime verification is codec-agnostic. */
  sha256: string
  codec: SeaAssetCodec
  /** Raw byte length; the packed blob payload may be smaller. */
  size: number
}

interface SeaManifest {
  version: string
  target: string
  files: ManifestFileEntry[]
}

interface PackageJsonShape {
  version?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * zstd level 9 is the only pack codec: level 19 costs ~37 s where 9 costs ~2 s,
 * for roughly 6% of the blob (machine code packs poorly either way).
 */
export function packAssetBytes(raw: Buffer): { codec: SeaAssetCodec; bytes: Buffer } {
  if (raw.byteLength < SEA_COMPRESSION_MIN_BYTES) {
    return { codec: 'none', bytes: raw }
  }
  const params: Record<number, number> = { [zlibConstants.ZSTD_c_compressionLevel]: 9 }
  if (raw.byteLength >= ZSTD_MULTITHREAD_MIN_BYTES) {
    params[zlibConstants.ZSTD_c_nbWorkers] = ZSTD_PACK_WORKERS
  }
  return { codec: 'zstd', bytes: zstdCompressSync(raw, { params }) }
}

/**
 * Plain ASCII key comparison — the manifest bytes must be reproducible
 * everywhere (the runtime natives dir is named after the manifest's sha256).
 */
export function sortManifestFiles<T extends { key: string }>(files: T[]): T[] {
  return files.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

function toPosixPath(path: string) {
  return path.split('\\').join('/')
}

/**
 * drizzle-kit snapshot artifacts — the embedded migrator only consumes
 * `migration.sql` keys, so snapshots never need to ride the blob.
 */
export function isDrizzleSnapshotArtifact(posixRelativePath: string): boolean {
  return (
    posixRelativePath === 'snapshot.json' ||
    posixRelativePath.endsWith('/snapshot.json') ||
    posixRelativePath.includes('/snapshot/')
  )
}

async function readJson(path: string): Promise<PackageJsonShape> {
  return JSON.parse(await readFile(path, 'utf-8'))
}

/** Recursive file listing of `root`, following symlinked files/dirs. */
async function listFiles(root: string) {
  const files: string[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (entry.isSymbolicLink()) {
        // Symlinks inside published packages (e.g. libvips.so.42 -> libvips.so.42.0.1).
        if (statSync(path).isDirectory()) {
          await walk(realpathSync(path))
          continue
        }
      }
      if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(path)
      }
    }
  }

  await walk(root)
  return files
}

/**
 * Real path of an installed package's root: `pkg/package.json` first, the
 * top-level node_modules symlink (sharp hides it via exports), or a
 * transitive pnpm package resolved from within a dependent (`resolveVia`).
 */
function resolvePackageRoot(name: string, resolveVia?: string) {
  try {
    return realpathSync(dirname(requireFromRepo.resolve(`${name}/package.json`)))
  } catch {
    if (resolveVia !== undefined) {
      const requireFromDep = createRequire(requireFromRepo.resolve(`${resolveVia}/package.json`))
      return realpathSync(dirname(requireFromDep.resolve(`${name}/package.json`)))
    }
    return realpathSync(join(repoRoot, 'node_modules', name))
  }
}

interface InstalledPackage {
  name: string
  root: string
}

/**
 * The one installed platform package out of an entry package's
 * optionalDependencies: under pnpm they are siblings of the package's real
 * location, so a sibling's existence picks exactly what this install provides.
 */
function findPlatformPackage(
  entryName: string,
  match: (dep: string) => boolean,
  { required, resolveVia }: { required: boolean; resolveVia?: string },
): InstalledPackage | null {
  let entryRoot: string
  try {
    entryRoot = resolvePackageRoot(entryName, resolveVia)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`Native package ${entryName} is not installed. Run pnpm install first.\n${reason}`)
  }
  const pkg: PackageJsonShape = JSON.parse(readFileSync(join(entryRoot, 'package.json'), 'utf-8'))
  // Scoped package realpaths end in `node_modules/@scope/<pkg>` — two levels up.
  const storeDir = entryName.startsWith('@') ? dirname(dirname(entryRoot)) : dirname(entryRoot)

  const matches: InstalledPackage[] = []
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
    if (!match(dep)) {
      continue
    }
    const sibling = join(storeDir, dep)
    if (existsSync(sibling)) {
      matches.push({ name: dep, root: realpathSync(sibling) })
    }
  }
  if (matches.length > 1) {
    fail(
      `Expected at most one installed platform package for ${entryName}, found: ${matches.map((m) => m.name).join(', ')}`,
    )
  }
  const match0 = matches[0]
  if (match0 === undefined) {
    if (required) {
      fail(
        `No installed platform package found for ${entryName} (${process.platform}-${process.arch}). Run pnpm install first.`,
      )
    }
    return null
  }
  return match0
}

async function singleFile(dir: string, pattern: RegExp, what: string): Promise<string> {
  const entries = await readdir(dir)
  const matches = entries.filter((name) => pattern.test(name) && statSync(join(dir, name)).isFile())
  if (matches.length !== 1) {
    fail(`Expected exactly one ${what} in ${dir}, found ${matches.length}: ${matches.join(', ') || '(none)'}`)
  }
  return join(dir, matches[0]!)
}

/**
 * Patch a STAGED addon copy so the OS loader finds its companion libraries
 * in the same flat dir — never the node_modules originals.
 */
function patchAddonRpath(stagedAddon: string, libraryFileNames: string[]) {
  if (process.platform === 'darwin') {
    for (const name of libraryFileNames) {
      run('install_name_tool', ['-change', `@rpath/${name}`, `@loader_path/${name}`, stagedAddon])
    }
    return
  }
  if (process.platform === 'linux') {
    run('patchelf', ['--set-rpath', '$ORIGIN', stagedAddon])
  }
}

/**
 * Collect the native dynamic libraries + platform metadata — exactly the
 * flat extraction dir's contents (5 files on darwin/linux, 7 on win32).
 */
async function addNativeAssets(assets: Map<string, string>, files: ManifestFileEntry[], ctx: PackContext) {
  const sharpPkg = findPlatformPackage(
    'sharp',
    (dep) => dep.startsWith('@img/sharp-') && !dep.startsWith('@img/sharp-libvips-') && !dep.includes('wasm32'),
    { required: true },
  )!
  const libvipsPkg = findPlatformPackage('sharp', (dep) => dep.startsWith('@img/sharp-libvips-'), { required: false })
  const canvasPkg = findPlatformPackage('@napi-rs/canvas', (dep) => dep.startsWith('@napi-rs/canvas-'), {
    required: true,
  })!
  const duckdbPkg = findPlatformPackage('@duckdb/node-bindings', (dep) => dep.startsWith('@duckdb/node-bindings-'), {
    required: true,
    resolveVia: '@duckdb/node-api',
  })!

  const sharpAddon = await singleFile(join(sharpPkg.root, 'lib'), /\.node$/, `${sharpPkg.name} addon (*.node)`)
  const libvipsDir = join((libvipsPkg ?? sharpPkg).root, 'lib')
  const libvipsEntries = await readdir(libvipsDir)
  const libvipsFileNames = libvipsEntries.filter(
    (name) => name.startsWith('libvips') && !name.endsWith('.js') && statSync(join(libvipsDir, name)).isFile(),
  )
  if (libvipsFileNames.length === 0) {
    fail(`No libvips library files found in ${libvipsDir}`)
  }
  const skiaAddon = await singleFile(canvasPkg.root, /^skia\..*\.node$/, `${canvasPkg.name} addon (skia.*.node)`)

  const duckdbAddon = await singleFile(duckdbPkg.root, /^duckdb\.node$/, `${duckdbPkg.name} addon (duckdb.node)`)
  const libduckdbName = await singleFile(
    duckdbPkg.root,
    /^(?:libduckdb\.(?:dylib|so)|duckdb\.dll)$/,
    `${duckdbPkg.name} libduckdb library`,
  ).then((path) => path.split(/[\\/]/).pop()!)

  const stagedDir = seaStagedNativesDir()
  await mkdir(stagedDir, { recursive: true })
  const stagedAddon = join(stagedDir, 'sharp.node')
  await copyFile(sharpAddon, stagedAddon)
  patchAddonRpath(stagedAddon, libvipsFileNames)
  const stagedDuckdbAddon = join(stagedDir, 'duckdb.node')
  await copyFile(duckdbAddon, stagedDuckdbAddon)
  patchAddonRpath(stagedDuckdbAddon, [libduckdbName])

  await addAsset(assets, files, SEA_NATIVE_SHARP_ADDON_KEY, stagedAddon, ctx)
  for (const name of libvipsFileNames) {
    await addAsset(assets, files, `${SEA_NATIVE_ASSET_PREFIX}${name}`, join(libvipsDir, name), ctx)
  }
  await addAsset(assets, files, SEA_NATIVE_SKIA_ADDON_KEY, skiaAddon, ctx)
  // ICU datafile rides only where the platform package ships one; it extracts beside skia.node.
  const skiaIcuData = join(canvasPkg.root, 'icudtl.dat')
  if (existsSync(skiaIcuData)) {
    await addAsset(assets, files, SEA_NATIVE_SKIA_ICU_KEY, skiaIcuData, ctx)
  }
  await addAsset(assets, files, SEA_NATIVE_DUCKDB_ADDON_KEY, stagedDuckdbAddon, ctx)
  await addAsset(assets, files, `${SEA_NATIVE_ASSET_PREFIX}${libduckdbName}`, join(duckdbPkg.root, libduckdbName), ctx)

  // Metadata the redirected probes answer from memory (ride only if present).
  await addAsset(assets, files, SEA_NATIVE_META_SHARP_PACKAGE_KEY, join(sharpPkg.root, 'package.json'), ctx)
  const sharpVersions = join(sharpPkg.root, 'versions.json')
  if (existsSync(sharpVersions)) {
    await addAsset(assets, files, SEA_NATIVE_META_SHARP_VERSIONS_KEY, sharpVersions, ctx)
  }
  if (libvipsPkg !== null) {
    await addAsset(assets, files, SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY, join(libvipsPkg.root, 'versions.json'), ctx)
    await addAsset(assets, files, SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY, join(libvipsPkg.root, 'package.json'), ctx)
  }
}

interface PackContext {
  packedDir: string
  rawBytes: number
  packedBytes: number
}

async function addAsset(
  assets: Map<string, string>,
  files: ManifestFileEntry[],
  key: string,
  sourcePath: string,
  ctx: PackContext,
) {
  if (assets.has(key)) {
    fail(`Duplicate SEA asset key ${key} (from ${sourcePath})`)
  }
  const raw = await readFile(sourcePath)
  const packed = shouldPackAsset(key) ? packAssetBytes(raw) : { codec: 'none' as const, bytes: raw }
  ctx.rawBytes += raw.byteLength
  ctx.packedBytes += packed.bytes.byteLength
  let blobPath = sourcePath
  if (packed.codec !== 'none') {
    blobPath = join(ctx.packedDir, key)
    await mkdir(dirname(blobPath), { recursive: true })
    await writeFile(blobPath, packed.bytes)
  }
  assets.set(key, blobPath)
  files.push({ key, path: key, sha256: sha256(raw), codec: packed.codec, size: raw.byteLength })
}

async function addTree(
  assets: Map<string, string>,
  files: ManifestFileEntry[],
  keyPrefix: string,
  root: string,
  ctx: PackContext,
  exclude?: (posixRelativePath: string) => boolean,
) {
  for (const file of await listFiles(root)) {
    const rel = toPosixPath(relative(root, file))
    if (exclude?.(rel)) {
      continue
    }
    await addAsset(assets, files, `${keyPrefix}${rel}`, file, ctx)
  }
}

/**
 * The returned map includes the manifest asset itself — never packed, the
 * runtime reader needs it first.
 */
export async function collectSeaAssets({ wasmPath }: { wasmPath: string }) {
  const assets = new Map<string, string>()
  const files: ManifestFileEntry[] = []
  // Wipe the packed dir so a rerun never leaves stale payloads.
  const ctx: PackContext = { packedDir: seaPackedAssetsDir(), rawBytes: 0, packedBytes: 0 }
  await rm(ctx.packedDir, { recursive: true, force: true })

  await addTree(assets, files, SEA_CLIENT_ASSET_PREFIX, join(repoRoot, 'build', 'client'), ctx)

  await addTree(assets, files, SEA_DRIZZLE_ASSET_PREFIX, join(repoRoot, 'drizzle'), ctx, isDrizzleSnapshotArtifact)

  // The cn-font-split wasm core (single hashed file, pinned to a stable key).
  await addAsset(assets, files, SEA_WASM_CNFS_KEY, wasmPath, ctx)

  // The image worker bundle, embedded as text and eval'd under SEA.
  await addAsset(assets, files, SEA_PROCESS_WORKER_BUNDLE_KEY, seaWorkerBundlePath(), ctx)

  await addAsset(assets, files, SEA_SMOKE_WORKER_BUNDLE_KEY, seaSmokeWorkerBundlePath(), ctx)

  // Observability provisioning assets (4 dashboards + the RUM privacy VRL) ride
  // raw — plain VFS files via `readAssetTextOrDisk`, never the packed blob channel.
  await addTree(
    assets,
    files,
    SEA_OBSERVABILITY_ASSET_PREFIX,
    join(repoRoot, 'src', 'server', 'domains', 'observability', 'assets'),
    ctx,
  )

  await addNativeAssets(assets, files, ctx)

  const pkg = await readJson(join(repoRoot, 'package.json'))
  const manifest: SeaManifest = {
    version: pkg.version ?? fail('package.json has no "version" field'),
    target: `${process.platform}-${process.arch}`,
    files: sortManifestFiles(files),
  }
  await mkdir(seaIntermediatesDir(), { recursive: true })
  const manifestPath = seaManifestPath()
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  assets.set(SEA_MANIFEST_KEY, manifestPath)

  // Deterministic asset order in the generated sea-config.json.
  const sorted = new Map([...assets.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return { assets: sorted, manifest, stats: { rawBytes: ctx.rawBytes, packedBytes: ctx.packedBytes } }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { assets, manifest, stats } = await collectSeaAssets({
    wasmPath: process.argv[2] ?? fail('Usage: node scripts/sea/assets.ts <path-to-cnfs-wasm>'),
  })
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
  console.log(
    `Collected ${assets.size} assets for ${manifest.target} (${manifest.files.length} manifest files, ` +
      `${mb(stats.rawBytes)} MB raw -> ${mb(stats.packedBytes)} MB packed)`,
  )
}
