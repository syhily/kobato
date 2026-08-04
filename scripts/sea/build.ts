// SEA build orchestrator (`pnpm run sea:build [--target core|frontend]`).
//
// Dual build line (see scripts/sea/target.ts):
//
//   core (default):
//     1. react-router build       apps/core/build/server (ESM chunks) +
//                                 apps/core/build/client
//     2. vite bundle              inline everything into server.mjs (the
//                                 injected ESM main) + process-worker.mjs +
//                                 smoke-worker.mjs (dist-sea/intermediates)
//     3. check-bundle             fail on leftover external specifiers
//     4. assets                   collect embedded assets + manifest.json
//                                 (client tree + drizzle migrations + wasm +
//                                 worker bundles + native libraries)
//     5. inject                   node --build-sea regenerates the blob and
//                                 patches the node binary — see inject.ts
//     6. checksum                 dist-sea/kobato.sha256
//
//   frontend:
//     1. react-router build       apps/public/build/server + build/client
//     2. vite bundle              inline the public server into server.mjs
//                                 (dist-sea/intermediates-frontend) — no
//                                 worker/smoke bundles
//     3. check-bundle             same scan, single bundle
//     4. assets                   public client tree only — no migrations,
//                                 no wasm, no workers, no natives
//     5. inject                   same `--build-sea` step
//     6. checksum                 dist-sea/kobato-frontend.sha256
//
// The build is platform-native by design: the embedded native libraries
// (core line) and the copied Node executable are the build machine's, so
// run it on the delivery target's architecture (CI matrix / linux
// container).

import { createHash } from 'node:crypto'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { collectSeaAssets, type SeaPackCodec } from './assets.ts'
import { BINARY_MAX_BYTES, FRONTEND_BINARY_MAX_BYTES } from './budget.ts'
import { fail, run } from './exec.ts'
import { runInjectStep } from './inject.ts'
import { repoRoot, seaBinaryFileName, seaBinaryPath, seaBinarySha256Path, seaIntermediatesDir } from './paths.ts'
import { resolveSeaTarget } from './target.ts'

const REQUIRED_NODE_MAJOR = 26

function ensureNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < REQUIRED_NODE_MAJOR) {
    fail(`SEA build requires Node.js >= ${REQUIRED_NODE_MAJOR}, current ${process.versions.node}.`)
  }
}

/**
 * Blob payload codec: `--codec zstd` (default, fast build/decode) or
 * `--codec brotli` (quality 11, smallest release binaries).
 */
function parseCodecArg(): SeaPackCodec {
  const index = process.argv.indexOf('--codec')
  if (index === -1) {
    return 'zstd'
  }
  const value = process.argv[index + 1]
  if (value === 'zstd' || value === 'brotli') {
    return value
  }
  fail(`Invalid --codec "${value ?? '(missing)'}" — expected "zstd" or "brotli".`)
}

/** The server build emits exactly one hashed cnfs wasm — pin it down (core line only). */
async function locateCnfsWasm() {
  const assetsDir = join(repoRoot, 'apps', 'core', 'build', 'server', 'assets')
  const entries = await readdir(assetsDir)
  const matches = entries.filter((name) => /^cnfs-.+\.wasm$/.test(name))
  if (matches.length !== 1) {
    fail(`Expected exactly one cnfs-*.wasm in ${assetsDir}, found ${matches.length}. Run pnpm run build first.`)
  }
  return join(assetsDir, matches[0])
}

async function writeBinaryChecksum(target: 'core' | 'frontend') {
  const hash = createHash('sha256')
  hash.update(await readFile(seaBinaryPath(target)))
  await writeFile(seaBinarySha256Path(target), `${hash.digest('hex')}  ${seaBinaryFileName(target)}\n`)
}

async function main() {
  ensureNodeVersion()
  const target = resolveSeaTarget()
  const codec = parseCodecArg()
  const maxBytes = target === 'core' ? BINARY_MAX_BYTES : FRONTEND_BINARY_MAX_BYTES
  console.log(
    `==> SEA build (${target}, ${process.platform}-${process.arch}, node ${process.versions.node}, codec ${codec})`,
  )

  console.log('==> react-router build')
  // Each line builds only its own app: the core binary embeds the core
  // app's client assets + server bundle, the frontend binary the public
  // app's (the two lines have no build-order dependency).
  const appDir = target === 'core' ? 'core' : 'public'
  run('pnpm', ['-C', `apps/${appDir}`, 'run', 'build'], { env: { ...process.env, NODE_ENV: 'production' } })

  console.log('==> vite bundle')
  // The bundles share the target's intermediates dir and none of them may
  // wipe it (emptyOutDir: false in vite.sea.config.ts) — clean it here.
  await rm(seaIntermediatesDir(target), { recursive: true, force: true })
  const seaBundles = target === 'core' ? ['server', 'worker', 'smoke'] : ['server']
  for (const seaBundle of seaBundles) {
    run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.sea.config.ts'], {
      env: { ...process.env, SEA_TARGET: target, SEA_BUNDLE: seaBundle },
    })
  }

  console.log('==> bundle check')
  run(process.execPath, [join(repoRoot, 'scripts', 'sea', 'check-bundle.ts'), '--target', target])

  console.log('==> collect assets')
  const wasmPath = target === 'core' ? await locateCnfsWasm() : undefined
  const { assets, stats } = await collectSeaAssets({ target, wasmPath, codec })
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
  console.log(`    ${assets.size} embedded assets, ${mb(stats.rawBytes)} MB raw -> ${mb(stats.packedBytes)} MB packed`)

  console.log('==> inject blob into node binary (--build-sea)')
  await runInjectStep(assets, target)

  await writeBinaryChecksum(target)

  const { size } = await stat(seaBinaryPath(target))
  const binaryMb = (size / 1024 / 1024).toFixed(1)
  // Enforce the shared compression budget (scripts/sea/budget.ts) at build
  // time — a blob packing regression must fail the build itself, not only
  // the later sea:smoke step (the Docker image build never runs it).
  if (size > maxBytes) {
    fail(`binary is ${binaryMb} MB, over the ${maxBytes / 1024 / 1024} MB budget`)
  }
  console.log(
    `==> SEA build complete: ${seaBinaryPath(target)} (${binaryMb} MB, within the ${maxBytes / 1024 / 1024} MB budget)`,
  )
}

await main()
