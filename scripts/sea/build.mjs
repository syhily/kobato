// SEA build orchestrator (`pnpm run sea:build`).
//
//   1. react-router build       build/server (ESM chunks) + build/client
//   2. tsdown                   inline everything into main.cjs +
//                               process-worker.cjs (dist-sea/intermediates)
//   3. check-bundle             fail on leftover external specifiers
//   4. assets                   collect embedded assets + manifest.json
//   5. blob                     node --experimental-sea-config
//   6. inject                   copy node + postject the blob
//   7. upx                      compress the injected binary (linux, when
//                               upx is available; scripts/sea/upx.mjs)
//   8. checksum                 dist-sea/kobato.sha256
//
// The build is platform-native by design: the embedded native packages
// and the copied Node executable are the build machine's, so run it on
// the delivery target's architecture (CI matrix / linux container).

import { createHash } from 'node:crypto'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { collectSeaAssets } from './assets.mjs'
import { runBlobStep } from './blob.mjs'
import { fail, run } from './exec.mjs'
import { runInjectStep } from './inject.mjs'
import { repoRoot, seaBinaryPath, seaBinarySha256Path, seaIntermediatesDir } from './paths.mjs'
import { maybeCompressWithUpx } from './upx.mjs'

const REQUIRED_NODE_MAJOR = 24

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
  await writeFile(seaBinarySha256Path(), `${hash.digest('hex')}  kobato\n`)
}

async function main() {
  ensureNodeVersion()
  console.log(`==> SEA build (${process.platform}-${process.arch}, node ${process.versions.node})`)

  console.log('==> react-router build')
  run('pnpm', ['run', 'build'], { env: { ...process.env, NODE_ENV: 'production' } })

  console.log('==> tsdown bundle')
  // tsdown runs its config-array entries in parallel, so `clean` cannot
  // be trusted there — wipe the intermediates dir up front instead.
  await rm(seaIntermediatesDir(), { recursive: true, force: true })
  run('pnpm', ['exec', 'tsdown', '--config', 'tsdown.sea.config.ts'])

  console.log('==> bundle check')
  run(process.execPath, [join(repoRoot, 'scripts', 'sea', 'check-bundle.mjs')])

  console.log('==> collect assets')
  const wasmPath = await locateCnfsWasm()
  const { assets } = await collectSeaAssets({ wasmPath })
  console.log(`    ${assets.size} embedded assets`)

  console.log('==> generate SEA blob')
  await runBlobStep(assets)

  console.log('==> inject blob into node binary')
  await runInjectStep()

  console.log('==> UPX compression')
  await maybeCompressWithUpx(seaBinaryPath())

  await writeBinaryChecksum()

  const { size } = await stat(seaBinaryPath())
  console.log(`==> SEA build complete: ${seaBinaryPath()} (${(size / 1024 / 1024).toFixed(1)} MB)`)
}

await main()
