import { collectSeaAssets } from '@kobato/pack/sea/assets'
import { BINARY_MAX_BYTES } from '@kobato/pack/sea/budget'
import { fail, run } from '@kobato/pack/sea/exec'
import { runInjectStep } from '@kobato/pack/sea/inject'
import { seaBinaryFileName, seaBinaryPath, seaBinarySha256Path, seaIntermediatesDir } from '@kobato/pack/sea/paths'
import { createHash } from 'node:crypto'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const REQUIRED_NODE_VERSION = '26.10.0'

function ensureNodeVersion() {
  const required = REQUIRED_NODE_VERSION.split('.').map(Number)
  const current = process.versions.node.split('.').map(Number)
  for (let index = 0; index < required.length; index += 1) {
    const delta = (current[index] ?? 0) - required[index]
    if (delta > 0) {
      return
    }
    if (delta < 0) {
      fail(`SEA build requires Node.js >= ${REQUIRED_NODE_VERSION}, current ${process.versions.node}.`)
    }
  }
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
  await rm(seaIntermediatesDir(), { recursive: true, force: true })
  for (const seaBundle of ['server', 'worker', 'smoke']) {
    run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.sea.config.ts'], {
      env: { ...process.env, SEA_BUNDLE: seaBundle },
    })
  }

  console.log('==> bundle check')
  run(process.execPath, [join(import.meta.dirname, 'check-bundle.ts')])

  console.log('==> collect assets')
  const { assets, stats } = await collectSeaAssets()
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
  console.log(`    ${assets.size} embedded assets, ${mb(stats.rawBytes)} MB raw -> ${mb(stats.packedBytes)} MB packed`)

  console.log('==> inject blob into node binary (--build-sea)')
  await runInjectStep(assets)

  await writeBinaryChecksum()

  const { size } = await stat(seaBinaryPath())
  const binaryMb = (size / 1024 / 1024).toFixed(1)
  if (size > BINARY_MAX_BYTES) {
    fail(`binary is ${binaryMb} MB, over the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget`)
  }
  console.log(
    `==> SEA build complete: ${seaBinaryPath()} (${binaryMb} MB, within the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget)`,
  )
}

await main()
