// SEA asset collection.
//
// Builds the embedded-asset map consumed by `node --build-sea`
// (see blob.ts) and writes the `manifest.json` asset that the runtime
// bootstrap (`src/server/infra/sea-natives.ts`) uses to verify and extract
// the native libraries.
//
// Every asset key comes from `src/shared/sea/assets.ts` — the single
// owner of the writer/reader key contract. Do not hardcode keys here.
//
// The manifest is `{ version, target, files: [{ key, path, sha256, codec,
// size }] }` where `path` equals the asset key, `sha256` hashes the RAW
// (uncompressed) bytes, `codec` records how the blob payload is packed,
// and `size` is the raw byte length. Only `natives/`-prefixed entries are
// extracted at runtime (into a FLAT dir — the extraction strips the
// prefix); the rest stay in the blob. The manifest does NOT list itself
// (its own hash would change its bytes). The natives cache dir is named
// after the sha256 of the exact manifest BYTES, so the file is serialized
// once, written to the intermediates dir, and embedded from that file —
// never re-serialized.
//
// Blob payload compression: every asset above `SEA_COMPRESSION_MIN_BYTES`
// is compressed (zstd by default, brotli behind `--codec brotli`) and the
// packed bytes are written to `dist-sea/intermediates/packed/<key>` — the
// sea-config asset entry points at the packed file while the asset KEY
// stays unchanged. The manifest itself is always embedded uncompressed:
// it doubles as the decompression registry, so the runtime reader
// (`src/server/infra/sea.ts`) must be able to parse it before decoding
// anything else. Hashes stay over the raw bytes, so natives verification
// is codec-agnostic.
//
// Native selection: the native packages' JS (sharp, sharp-ico,
// @napi-rs/canvas) is bundled into the server/worker bundles with its
// platform loads redirected to `nativeRequire` (see
// scripts/sea/redirect-native-requires.ts), so the blob carries ONLY the
// files that cannot ride in JS:
//   - the platform sharp addon (`@img/sharp-<platform>`'s `*.node`),
//     rpath-patched so the OS loader finds libvips in the same flat dir
//     (darwin: `install_name_tool -change @rpath/X @loader_path/X`;
//     linux: `patchelf --set-rpath '$ORIGIN'`; win32: nothing — the DLL
//     search covers the loaded module's own directory). The patch runs
//     on a COPY staged under intermediates/staged-natives/, never on the
//     node_modules original;
//   - the libvips library files (one on darwin/linux, two DLLs on win32,
//     where they ship inside the sharp platform package itself);
//   - the platform skia addon (`@napi-rs/canvas-<triple>`'s `skia.*.node`);
//   - the `natives-meta/*` metadata JSON the redirected probes answer
//     from memory (libvips/sharp platform package.json + versions.json —
//     the subsets that exist on this platform).
// sharp-ico embeds nothing: it is pure JS and rides inside the bundles.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { brotliCompressSync, constants as zlibConstants, zstdCompressSync } from 'node:zlib'

// Relative import on purpose: this script runs under plain `node` (no
// tsconfig path aliases), so `@/shared/...` would not resolve.
import {
  SEA_CLIENT_ASSET_PREFIX,
  SEA_DRIZZLE_ASSET_PREFIX,
  SEA_MANIFEST_KEY,
  SEA_NATIVE_ASSET_PREFIX,
  SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY,
  SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY,
  SEA_NATIVE_META_SHARP_PACKAGE_KEY,
  SEA_NATIVE_META_SHARP_VERSIONS_KEY,
  SEA_NATIVE_SHARP_ADDON_KEY,
  SEA_NATIVE_SKIA_ADDON_KEY,
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
 * Assets smaller than this stay uncompressed (`codec: 'none'`) — codec
 * framing and the decode call outweigh the savings on the long tail of
 * tiny files.
 */
export const SEA_COMPRESSION_MIN_BYTES = 1024

/** Codec the build packs with — `'none'` is never a build choice, only the per-asset fallback. */
export type SeaPackCodec = Exclude<SeaAssetCodec, 'none'>

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
 * Compress one asset's raw bytes for the blob. Assets below
 * `SEA_COMPRESSION_MIN_BYTES` keep their raw bytes (`codec: 'none'`).
 * zstd packs at level 19 (max without the memory-hungry "ultra" levels);
 * brotli packs at quality 11 — both decode fast enough that cold-start
 * cost stays trivial next to native extraction.
 */
export function packAssetBytes(raw: Buffer, codec: SeaPackCodec): { codec: SeaAssetCodec; bytes: Buffer } {
  if (raw.byteLength < SEA_COMPRESSION_MIN_BYTES) {
    return { codec: 'none', bytes: raw }
  }
  if (codec === 'brotli') {
    return {
      codec,
      bytes: brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }),
    }
  }
  return {
    codec,
    bytes: zstdCompressSync(raw, { params: { [zlibConstants.ZSTD_c_compressionLevel]: 19 } }),
  }
}

/**
 * Sort manifest files by key with plain ASCII comparison (not
 * localeCompare — ICU data can differ between Node builds, and the
 * manifest bytes must be reproducible everywhere: the runtime natives dir
 * is named after the manifest's sha256). Generic so tests can sort
 * partial entries.
 */
export function sortManifestFiles<T extends { key: string }>(files: T[]): T[] {
  return files.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

function toPosixPath(path: string) {
  return path.split('\\').join('/')
}

/**
 * drizzle-kit snapshot artifacts (`<folder>/snapshot.json`, or a
 * `snapshot/` subdir in older layouts). The embedded migration reader
 * only consumes `<folder>/migration.sql` keys — these never need to ride
 * the blob. Exported for tests.
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
        // pnpm links are already resolved by the caller (roots are
        // realpath'ed); this covers symlinks INSIDE published packages
        // (e.g. libvips.so.42 -> libvips.so.42.0.1). The bytes are
        // embedded under the link name and extracted as real files.
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
 * Real path of an installed package's root directory. `pkg/package.json`
 * is tried first; packages whose exports map hides it (sharp does) fall
 * back to realpath'ing the top-level node_modules symlink.
 */
function resolvePackageRoot(name: string) {
  try {
    return realpathSync(dirname(requireFromRepo.resolve(`${name}/package.json`)))
  } catch {
    return realpathSync(join(repoRoot, 'node_modules', name))
  }
}

interface InstalledPackage {
  name: string
  root: string
}

/**
 * The one installed platform package out of an entry package's
 * optionalDependencies. Under pnpm each package's optional deps are
 * symlinked as siblings of the package's real location
 * (`<store>/<pkg>@<ver>/node_modules/<dep>`), so a sibling's existence
 * picks exactly the package this install provides — platform-filtered
 * optional deps that were skipped simply have no sibling. Non-required
 * misses return null (sharp's libvips package legitimately does not exist
 * on win32, where libvips ships inside the sharp platform package).
 */
function findPlatformPackage(
  entryName: string,
  match: (dep: string) => boolean,
  { required }: { required: boolean },
): InstalledPackage | null {
  let entryRoot: string
  try {
    entryRoot = resolvePackageRoot(entryName)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`Native package ${entryName} is not installed. Run pnpm install first.\n${reason}`)
  }
  const pkg: PackageJsonShape = JSON.parse(readFileSync(join(entryRoot, 'package.json'), 'utf-8'))
  // A scoped package's realpath ends in `<store>/node_modules/@scope/<pkg>`,
  // so the store dir is two levels up (one for unscoped names).
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

/** The single file matching `pattern` directly inside `dir` — fail loudly on ambiguity. */
async function singleFile(dir: string, pattern: RegExp, what: string): Promise<string> {
  const entries = await readdir(dir)
  const matches = entries.filter((name) => pattern.test(name) && statSync(join(dir, name)).isFile())
  if (matches.length !== 1) {
    fail(`Expected exactly one ${what} in ${dir}, found ${matches.length}: ${matches.join(', ') || '(none)'}`)
  }
  return join(dir, matches[0]!)
}

/**
 * Patch the STAGED sharp addon copy so the OS loader finds libvips in the
 * same flat dir (the S1 spike recipe); the node_modules original is never
 * touched. darwin rewrites the `@rpath` reference to `@loader_path`;
 * linux sets the rpath to `$ORIGIN` (needs patchelf — Dockerfile build
 * stage and the linux CI runners carry it); win32 needs nothing — the
 * DLL search order covers the loaded module's own directory.
 */
function patchSharpAddonRpath(stagedAddon: string, libvipsFileNames: string[]) {
  if (process.platform === 'darwin') {
    for (const name of libvipsFileNames) {
      run('install_name_tool', ['-change', `@rpath/${name}`, `@loader_path/${name}`, stagedAddon])
    }
    return
  }
  if (process.platform === 'linux') {
    run('patchelf', ['--set-rpath', '$ORIGIN', stagedAddon])
  }
}

/**
 * Collect the native dynamic libraries + platform metadata. Exactly what
 * the flat extraction dir holds at runtime: the (rpath-patched) sharp
 * addon, the libvips library files, and the skia addon — 3 files on
 * darwin/linux, 4 on win32 (libvips splits into two DLLs there). No
 * node_modules tree, no npm package files, no generated shims.
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

  // The platform addons + the libvips library files.
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

  // Stage + rpath-patch the sharp addon (copy only — see above).
  const stagedDir = seaStagedNativesDir()
  await mkdir(stagedDir, { recursive: true })
  const stagedAddon = join(stagedDir, 'sharp.node')
  await copyFile(sharpAddon, stagedAddon)
  patchSharpAddonRpath(stagedAddon, libvipsFileNames)

  await addAsset(assets, files, SEA_NATIVE_SHARP_ADDON_KEY, stagedAddon, ctx)
  for (const name of libvipsFileNames) {
    await addAsset(assets, files, `${SEA_NATIVE_ASSET_PREFIX}${name}`, join(libvipsDir, name), ctx)
  }
  await addAsset(assets, files, SEA_NATIVE_SKIA_ADDON_KEY, skiaAddon, ctx)

  // Metadata the redirected probes answer from memory (`natives-meta/*`).
  // Each entry rides only when the source file exists on this platform:
  // win32 has no libvips package (its libvips versions.json lives in the
  // sharp platform package instead), and non-win32 sharp platform
  // packages ship no versions.json at all.
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

/** Shared state for `addAsset` — the build codec, the packed-payload dir, and byte totals for the build log. */
interface PackContext {
  codec: SeaPackCodec
  packedDir: string
  rawBytes: number
  packedBytes: number
}

/**
 * Add one file to the asset map: hash the RAW bytes, pack the payload
 * (compressed into `<packedDir>/<key>` unless tiny), and point the map at
 * the file the blob must store. The manifest entry keeps the raw sha256
 * and gains the codec + raw size — runtime verification hashes the
 * decoded bytes, so it is codec-agnostic.
 */
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
  const packed = packAssetBytes(raw, ctx.codec)
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

/** Add every file of `root` to the asset map under `keyPrefix` (with trailing slash). */
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
 * Collect the full asset map, write `manifest.json` into the
 * intermediates dir, and return the map including that manifest asset.
 * The manifest is never packed: it is the decompression registry and must
 * stay readable before anything else in the blob.
 */
export async function collectSeaAssets({ wasmPath, codec = 'zstd' }: { wasmPath: string; codec?: SeaPackCodec }) {
  const assets = new Map<string, string>()
  const files: ManifestFileEntry[] = []
  // Wipe the packed dir so a codec switch never leaves stale payloads
  // behind (build.ts wipes the whole intermediates dir; the standalone
  // CLI below does not).
  const ctx: PackContext = { codec, packedDir: seaPackedAssetsDir(), rawBytes: 0, packedBytes: 0 }
  await rm(ctx.packedDir, { recursive: true, force: true })

  // Whole build/client tree (fingerprinted static assets + public files).
  await addTree(assets, files, SEA_CLIENT_ASSET_PREFIX, join(repoRoot, 'build', 'client'), ctx)

  // Whole drizzle/ tree minus the drizzle-kit snapshot artifacts: the
  // embedded migrator discovers folders by their `*/migration.sql` key
  // only (see src/server/infra/db/migrate.ts), so `snapshot.json` files
  // (and any `snapshot/` subdir) are dead weight in the blob. The fs
  // migrator used outside SEA reads them from disk — this exclusion only
  // narrows what rides the binary.
  await addTree(assets, files, SEA_DRIZZLE_ASSET_PREFIX, join(repoRoot, 'drizzle'), ctx, isDrizzleSnapshotArtifact)

  // The cn-font-split wasm core (single hashed file inside the server
  // build, pinned to a stable key — build.mjs locates it).
  await addAsset(assets, files, SEA_WASM_CNFS_KEY, wasmPath, ctx)

  // The bundled image worker, embedded as text and started via
  // `new Worker(code, { eval: true })` under SEA.
  await addAsset(assets, files, SEA_PROCESS_WORKER_BUNDLE_KEY, seaWorkerBundlePath(), ctx)

  // The bundled worker-pool smoke entry, embedded as text and dispatched
  // by the binary's `--smoke-worker` flag via
  // `new Worker(code, { eval: true })` (see `@/server/infra/sea-cli`).
  await addAsset(assets, files, SEA_SMOKE_WORKER_BUNDLE_KEY, seaSmokeWorkerBundlePath(), ctx)

  // Native dynamic libraries (rpath-patched sharp addon, libvips, skia)
  // + the platform metadata the redirected native probes answer — the
  // only assets extracted to disk at runtime (see the header comment).
  await addNativeAssets(assets, files, ctx)

  // Manifest: sorted for deterministic bytes (the runtime natives dir is
  // named after the manifest's sha256 — stable bytes mean cache reuse).
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
