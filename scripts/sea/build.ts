// SEA build orchestrator (`pnpm run sea:build`).
// Platform-native by design: the embedded natives and the copied Node
// executable are the build machine's, so build on the delivery target's arch.

import { createHash } from 'node:crypto'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { collectSeaAssets } from './assets.ts'
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
  console.log(`==> SEA build (${process.platform}-${process.arch}, node ${process.versions.node})`)

  console.log('==> react-router build')
  run('pnpm', ['run', 'build'], { env: { ...process.env, NODE_ENV: 'production' } })

  console.log('==> vite bundle')
  // None of the bundles may wipe the shared intermediates dir — clean it here.
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
  const { assets, stats } = await collectSeaAssets({ wasmPath })
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
  console.log(`    ${assets.size} embedded assets, ${mb(stats.rawBytes)} MB raw -> ${mb(stats.packedBytes)} MB packed`)

  console.log('==> inject blob into node binary (--build-sea)')
  await runInjectStep(assets)

  await writeBinaryChecksum()

  const { size } = await stat(seaBinaryPath())
  const binaryMb = (size / 1024 / 1024).toFixed(1)
  // Fail the build on budget regression — the Docker image build never runs sea:smoke.
  if (size > BINARY_MAX_BYTES) {
    fail(`binary is ${binaryMb} MB, over the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget`)
  }
  console.log(
    `==> SEA build complete: ${seaBinaryPath()} (${binaryMb} MB, within the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget)`,
  )
}

await main()
