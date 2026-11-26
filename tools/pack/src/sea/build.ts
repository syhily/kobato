import { fail } from '@kobato/pack/process'
import { collectSeaAssets } from '@kobato/pack/sea/assets'
import { BINARY_MAX_BYTES } from '@kobato/pack/sea/budget'
import { run } from '@kobato/pack/sea/exec'
import { runInjectStep } from '@kobato/pack/sea/inject'
import {
  SEA_APPS,
  seaBinaryFileName,
  seaBinaryPath,
  seaBinarySha256Path,
  seaIntermediatesDir,
  type SeaApp,
} from '@kobato/pack/sea/paths'
import { createHash } from 'node:crypto'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const REQUIRED_NODE_VERSION = '26.10.0'

const SEA_BUNDLES = ['server', 'worker', 'smoke', 'sayaka'] as const

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

async function writeBinaryChecksum(app: SeaApp) {
  const hash = createHash('sha256')
  hash.update(await readFile(seaBinaryPath(app)))
  await writeFile(seaBinarySha256Path(app), `${hash.digest('hex')}  ${seaBinaryFileName(app)}\n`)
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

async function buildAppBinary(app: SeaApp) {
  console.log(`==> collect assets (${app})`)
  const { assets, stats } = await collectSeaAssets(app)
  console.log(`    ${assets.size} embedded assets, ${mb(stats.rawBytes)} MB raw -> ${mb(stats.packedBytes)} MB packed`)

  console.log(`==> inject blob into the ${app} binary (--build-sea)`)
  await runInjectStep(assets, app)

  await writeBinaryChecksum(app)

  const { size } = await stat(seaBinaryPath(app))
  const binaryMb = mb(size)
  if (size > BINARY_MAX_BYTES) {
    fail(`the ${app} binary is ${binaryMb} MB, over the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget`)
  }
  console.log(
    `==> ${app} binary complete: ${seaBinaryPath(app)} (${binaryMb} MB, within the ${
      BINARY_MAX_BYTES / 1024 / 1024
    } MB budget)`,
  )
}

async function main() {
  ensureNodeVersion()
  console.log(`==> SEA build (${process.platform}-${process.arch}, node ${process.versions.node})`)

  console.log('==> react-router build')
  run('pnpm', ['run', 'build'], { env: { ...process.env, NODE_ENV: 'production' } })

  console.log('==> vite bundles')
  for (const app of SEA_APPS) {
    await rm(seaIntermediatesDir(app), { recursive: true, force: true })
  }
  for (const bundle of SEA_BUNDLES) {
    run('pnpm', ['exec', 'vite', 'build', '--config', join(import.meta.dirname, '..', '..', 'vite.config.ts')], {
      env: { ...process.env, SEA_BUNDLE: bundle },
    })
  }

  console.log('==> bundle check')
  run(process.execPath, [join(import.meta.dirname, 'check-bundle.ts')])

  for (const app of SEA_APPS) {
    await buildAppBinary(app)
  }
}

await main()
