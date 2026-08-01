// SEA build orchestrator (`pnpm run sea:build`).
//
//   1. react-router build       build/server (ESM chunks) + build/client
//   2. vite bundle              inline everything into server.mjs (the
//                               injected ESM main) + process-worker.mjs +
//                               smoke-worker.mjs (dist-sea/intermediates)
//   3. check-bundle             fail on leftover external specifiers
//   4. assets                   collect embedded assets + manifest.json
//   5. inject                   node --build-sea regenerates the blob and
//                               patches the node binary — see inject.ts
//   6. checksum                 dist-sea/kobato.sha256
//
// The build is platform-native by design: the embedded native libraries
// and the copied Node executable are the build machine's, so run it on
// the delivery target's architecture (CI matrix / linux container).

import { createHash } from 'node:crypto'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { collectSeaAssets, type SeaPackCodec } from './assets.ts'
import { BINARY_MAX_BYTES } from './budget.ts'
import { fail, run } from './exec.ts'
import { runInjectStep } from './inject.ts'
import { repoRoot, seaBinaryFileName, seaBinaryPath, seaBinarySha256Path, seaIntermediatesDir } from './paths.ts'

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

/** The server build emits exactly one hashed cnfs wasm — pin it down. */
async function locateCnfsWasm() {
  const assetsDir = join(repoRoot, 'build', 'server', 'assets')
  const entries = await readdir(assetsDir)
  const matches = entries.filter((name) => /^cnfs-.+\.wasm$/.test(name))
  if (matches.length !== 1) {
    fail(`Expected exactly one cnfs-*.wasm in ${assetsDir}, found ${matches.length}. Run pnpm run build first.`)
  }
  return join(assetsDir, matches[0])
}

async function writeBinaryChecksum() {
  const hash = createHash('sha256')
  hash.update(await readFile(seaBinaryPath()))
  await writeFile(seaBinarySha256Path(), `${hash.digest('hex')}  ${seaBinaryFileName()}\n`)
}

async function main() {
  ensureNodeVersion()
  const codec = parseCodecArg()
  console.log(`==> SEA build (${process.platform}-${process.arch}, node ${process.versions.node}, codec ${codec})`)

  console.log('==> react-router build')
  run('pnpm', ['run', 'build'], { env: { ...process.env, NODE_ENV: 'production' } })

  console.log('==> vite bundle')
  // The three bundles share the intermediates dir and none of them may
  // wipe it (emptyOutDir: false in vite.sea.config.ts) — clean it here.
  await rm(seaIntermediatesDir(), { recursive: true, force: true })
  for (const seaBundle of ['server', 'worker', 'smoke']) {
    run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.sea.config.ts'], {
      env: { ...process.env, SEA_BUNDLE: seaBundle },
    })
  }

  console.log('==> bundle check')
  run(process.execPath, [join(repoRoot, 'scripts', 'sea', 'check-bundle.ts')])

  console.log('==> collect assets')
  const wasmPath = await locateCnfsWasm()
  const { assets, stats } = await collectSeaAssets({ wasmPath, codec })
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
  console.log(`    ${assets.size} embedded assets, ${mb(stats.rawBytes)} MB raw -> ${mb(stats.packedBytes)} MB packed`)

  console.log('==> inject blob into node binary (--build-sea)')
  await runInjectStep(assets)

  await writeBinaryChecksum()

  const { size } = await stat(seaBinaryPath())
  const binaryMb = (size / 1024 / 1024).toFixed(1)
  // Enforce the shared compression budget (scripts/sea/budget.ts) at build
  // time — a blob packing regression must fail the build itself, not only
  // the later sea:smoke step (the Docker image build never runs it).
  if (size > BINARY_MAX_BYTES) {
    fail(`binary is ${binaryMb} MB, over the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget`)
  }
  console.log(
    `==> SEA build complete: ${seaBinaryPath()} (${binaryMb} MB, within the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget)`,
  )
}

await main()
