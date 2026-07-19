// SEA asset collection.
//
// Builds the embedded-asset map consumed by `node --experimental-sea-config`
// (see blob.ts) and writes the `manifest.json` asset that the runtime
// bootstrap (`src/server/infra/sea-natives.ts`) uses to verify and extract
// the native packages.
//
// Asset keys (the runtime contract — do not rename without touching the
// readers in src/server/):
//   manifest.json                    this build's manifest (see below)
//   server/server.mjs                single-file ESM server bundle
//   client/<path>                    whole build/client tree (static assets)
//   drizzle/<folder>/<file>          whole drizzle/ tree (migrations)
//   wasm/cnfs.wasm                   the cn-font-split wasm core
//   worker/process-worker.cjs        tsdown-emitted image worker (text)
//   worker/smoke-worker.cjs          tsdown-emitted --smoke-worker entry
//   node_modules/<pkg>/<file>        native packages, extracted at first run
//
// The manifest is `{ version, target, files: [{ key, path, sha256 }] }`
// where `path` equals the asset key. Only `node_modules/`-prefixed entries
// are extracted at runtime; the rest stay in the blob. The manifest does
// NOT list itself (its own hash would change its bytes). The natives cache
// dir is named after the sha256 of the exact manifest BYTES, so the file
// is serialized once, written to the intermediates dir, and embedded from
// that file — never re-serialized.
//
// Native package selection: sharp, sharp-ico and @napi-rs/canvas are
// embedded with their WHOLE dependency closure (detect-libc, semver,
// @img/colour, decode-ico, ico-endec, the platform-specific @img/* and
// @napi-rs/canvas-* packages, …) so `requireExternal` can load them from a
// flat extracted node_modules tree. The closure is walked structurally —
// from each package's realpath, its dependencies/optionalDependencies are
// looked up as pnpm sibling links — which automatically picks exactly the
// platform packages this install provides (glibc vs musl vs darwin).

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'

import { fail } from './exec.ts'
import {
  repoRoot,
  seaIntermediatesDir,
  seaManifestPath,
  seaServerBundlePath,
  seaSmokeWorkerBundlePath,
  seaWorkerBundlePath,
} from './paths.ts'

const requireFromRepo = createRequire(join(repoRoot, 'package.json'))

const NATIVE_ENTRY_PACKAGES = ['sharp', 'sharp-ico', '@napi-rs/canvas']

interface ManifestFileEntry {
  key: string
  path: string
  sha256: string
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

function toPosixPath(path: string) {
  return path.split('\\').join('/')
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

/**
 * Real paths of every package in the native dependency closure. Under
 * pnpm each package's deps are symlinked as siblings of the package's
 * real location (`<store>/<pkg>@<ver>/node_modules/<dep>`), so walking
 * siblings per package.json (dependencies + optionalDependencies)
 * collects exactly the installed subset — platform-filtered optional
 * deps that were skipped simply have no sibling. Discovered deps carry
 * their sibling-resolved root along: they are not top-level
 * node_modules entries, so re-resolving them from the repo root would
 * fail.
 */
function collectNativePackageRoots() {
  const rootsByName = new Map<string, string>()
  const queue: { name: string; root: string | null }[] = NATIVE_ENTRY_PACKAGES.map((name) => ({
    name,
    root: null,
  }))

  while (queue.length > 0) {
    const item = queue.shift()!
    if (rootsByName.has(item.name)) {
      continue
    }
    let root = item.root
    if (root === null) {
      try {
        root = resolvePackageRoot(item.name)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        fail(`Native package ${item.name} is not installed. Run pnpm install first.\n${reason}`)
      }
    }
    rootsByName.set(item.name, root)

    const pkg: PackageJsonShape = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
    // Sibling lookup: the package's own node_modules dir. A scoped
    // package's realpath ends in `<store>/node_modules/@scope/<pkg>`, so
    // the store dir is two levels up (one for unscoped names).
    const storeDir = item.name.startsWith('@') ? dirname(dirname(root)) : dirname(root)
    const depNames = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]
    for (const dep of depNames) {
      if (dep.startsWith('@types/') || rootsByName.has(dep)) {
        continue
      }
      const sibling = join(storeDir, dep)
      if (existsSync(sibling)) {
        queue.push({ name: dep, root: realpathSync(sibling) })
      }
    }
  }

  return rootsByName
}

/** Add every file of `root` to the asset map under `keyPrefix`. */
async function addTree(assets: Map<string, string>, files: ManifestFileEntry[], keyPrefix: string, root: string) {
  for (const file of await listFiles(root)) {
    const key = `${keyPrefix}/${toPosixPath(relative(root, file))}`
    if (assets.has(key)) {
      fail(`Duplicate SEA asset key ${key} (from ${file})`)
    }
    assets.set(key, file)
    files.push({ key, path: key, sha256: sha256(await readFile(file)) })
  }
}

/**
 * Collect the full asset map, write `manifest.json` into the
 * intermediates dir, and return the map including that manifest asset.
 */
export async function collectSeaAssets({ wasmPath }: { wasmPath: string }) {
  const assets = new Map<string, string>()
  const files: ManifestFileEntry[] = []

  // Whole build/client tree (fingerprinted static assets + public files).
  await addTree(assets, files, 'client', join(repoRoot, 'build', 'client'))

  // Whole drizzle/ tree (migration.sql files + snapshots).
  await addTree(assets, files, 'drizzle', join(repoRoot, 'drizzle'))

  // The cn-font-split wasm core (single hashed file inside the server
  // build, pinned to a stable key — build.mjs locates it).
  assets.set('wasm/cnfs.wasm', wasmPath)
  files.push({ key: 'wasm/cnfs.wasm', path: 'wasm/cnfs.wasm', sha256: sha256(await readFile(wasmPath)) })

  // The tsdown-emitted single-file ESM server bundle. Materialized into
  // the natives cache dir at runtime (its manifest entry drives both the
  // dir name and the sha256 verification) and imported from there —
  // top-level await keeps it out of the CJS prelude bundle.
  const serverPath = seaServerBundlePath()
  assets.set('server/server.mjs', serverPath)
  files.push({
    key: 'server/server.mjs',
    path: 'server/server.mjs',
    sha256: sha256(await readFile(serverPath)),
  })

  // The tsdown-emitted image worker, embedded as text and started via
  // `new Worker(code, { eval: true })` under SEA.
  const workerPath = seaWorkerBundlePath()
  assets.set('worker/process-worker.cjs', workerPath)
  files.push({
    key: 'worker/process-worker.cjs',
    path: 'worker/process-worker.cjs',
    sha256: sha256(await readFile(workerPath)),
  })

  // The tsdown-emitted worker-pool smoke entry. Materialized into the
  // natives cache dir on demand by the prelude's `--smoke-worker` flag —
  // the same mechanism as `server/server.mjs` (sha256-verified, atomic
  // writes, stale-dir GC) — and imported from there.
  const smokeWorkerPath = seaSmokeWorkerBundlePath()
  assets.set('worker/smoke-worker.cjs', smokeWorkerPath)
  files.push({
    key: 'worker/smoke-worker.cjs',
    path: 'worker/smoke-worker.cjs',
    sha256: sha256(await readFile(smokeWorkerPath)),
  })

  // Native packages: whole dependency closure of sharp / sharp-ico /
  // @napi-rs/canvas, laid out as a flat node_modules tree so Node's
  // resolver works unchanged inside the extraction dir.
  for (const [name, root] of collectNativePackageRoots()) {
    await addTree(assets, files, `node_modules/${name}`, root)
  }

  // Manifest: sorted for deterministic bytes (the runtime natives dir is
  // named after the manifest's sha256 — stable bytes mean cache reuse).
  // Plain ASCII comparison, not localeCompare — ICU data can differ
  // between Node builds, and the bytes must be reproducible everywhere.
  files.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const pkg = await readJson(join(repoRoot, 'package.json'))
  const manifest: SeaManifest = {
    version: pkg.version ?? fail('package.json has no "version" field'),
    target: `${process.platform}-${process.arch}`,
    files,
  }
  await mkdir(seaIntermediatesDir(), { recursive: true })
  const manifestPath = seaManifestPath()
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  assets.set('manifest.json', manifestPath)

  // Deterministic asset order in the generated sea-config.json.
  const sorted = new Map([...assets.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return { assets: sorted, manifest }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { assets, manifest } = await collectSeaAssets({
    wasmPath: process.argv[2] ?? fail('Usage: node scripts/sea/assets.ts <path-to-cnfs-wasm>'),
  })
  console.log(`Collected ${assets.size} assets for ${manifest.target} (${manifest.files.length} manifest files)`)
}
