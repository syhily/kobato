import {
  SEA_CLIENT_ASSET_PREFIX,
  SEA_DRIZZLE_ASSET_PREFIX,
  SEA_MANIFEST_KEY,
  SEA_NATIVE_ASSET_PREFIX,
  SEA_SMOKE_WORKER_BUNDLE_KEY,
} from '@kobato/distribution/sea-assets'
import { parseConfigArg } from '@kobato/server/infra/config-arg'
import { rollbackBinary } from '@kobato/server/infra/sea/binary-rollback'
import {
  collectDoctorReport,
  doctorOk,
  formatDoctorText,
  parseProbeIssues,
} from '@kobato/server/infra/sea/doctor-report'
import { runIntlProbe } from '@kobato/server/infra/sea/intl-probe'
import { isSea, seaAssetPath, seaVfsRoot } from '@kobato/server/infra/sea/sea'
import { bootstrapSeaRuntime } from '@kobato/server/infra/sea/sea-natives'
import { installSeaVfsRuntimePatches } from '@kobato/server/infra/sea/sea-vfs-fs-patch'
import { evaluateSelfUpdateGate } from '@kobato/server/infra/sea/self-update-gate'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'

declare const __SEA_APP_VERSION__: string

const USAGE = `kobato — self-hosted blog CMS (single executable)

Usage:
  kobato                   Start the server (see configuration below)
  kobato --version, -v     Print the version and exit
  kobato --help, -h        Print this help and exit
  kobato --smoke-natives   Extract and load the native packages (sharp,
                           @napi-rs/canvas, the DuckDB engine, font-split),
                           run a tiny render + a tiny aggregate, and exit
  kobato --smoke-worker    Round-trip a real sharp job through the
                           worker_threads image pool and exit. Requires
                           the full configuration (validated, never
                           connected to).
  kobato --smoke-vfs       Verify the mounted asset VFS: layout, fs reads
                           through node:fs, the read-only guarantee (writes
                           fail with EROFS), and the writev repair (a
                           buffered WriteStream flush on the real fs).
                           Exits 1 on failure.
  kobato --smoke-intl      Verify the bundled ICU data on all four UI
                           locales: supportedLocalesOf plus real
                           DateTimeFormat / RelativeTimeFormat /
                           DisplayNames / PluralRules / ListFormat /
                           Collator output and the production
                           formatDuration result. No config, no
                           database. Exits 1 on failure.
  kobato rollback          Restore the previous release: swaps the
                           <binary>.bak sibling left by the last
                           self-update back into place. Restart the
                           service afterwards (e.g. systemctl restart
                           <service>) to run the restored build.
  kobato doctor [--json]   Print an aggregated diagnostic report:
                           version, native libraries, configuration
                           validation, and self-update readiness.
                           Exits 1 when natives or config fail.

Configuration:
  --config, -c <path>      Config file to use. Resolution order without it:
                           <binary dir>/kobato.config.json, then
                           ./kobato.config.json, then
                           ~/.config/kobato.config.json. The file is created
                           with defaults when missing.
  Environment variables    Override config values and are written back into
                           the file. Names follow the nested path with a
                           double underscore, e.g.:
                             storage.database       → storage__database
                             security.sessionSecret → security__sessionSecret
                             security.encryptionKey → security__encryptionKey
                             storage.data           → storage__data

Optional environment variables:
  KOBATO_CACHE_DIR Cache directory for extracted native packages
                   (default: $XDG_CACHE_HOME/kobato or ~/.cache/kobato)
`

async function smokeNatives(quiet = false): Promise<void> {
  bootstrapSeaRuntime()

  const { default: sharp } = await import('sharp')
  const rawPixels = Buffer.alloc(8 * 8 * 3, 128)
  const png = await sharp(rawPixels, { raw: { width: 8, height: 8, channels: 3 } })
    .png()
    .toBuffer()
  const reencoded = await sharp(png, { failOn: 'error' }).jpeg().toBuffer()
  if (reencoded.byteLength === 0) {
    throw new Error('sharp re-encode produced an empty buffer')
  }

  const { createCanvas } = await import('@napi-rs/canvas')
  const canvas = createCanvas(8, 8)
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgb(128, 128, 128)'
  context.fillRect(0, 0, 8, 8)
  if (canvas.toBuffer('image/png').byteLength === 0) {
    throw new Error('@napi-rs/canvas PNG encode produced an empty buffer')
  }

  const { runDuckDbSelfCheck } = await import('@kobato/db/duckdb/self-check')
  await runDuckDbSelfCheck()

  const { FONT_SPLIT_ADDON_SPEC, nativeRequire } = await import('@kobato/server/infra/sea/native-require')
  const fontSplitBinding = unsafeCast<{ fontSplit?: unknown }>(nativeRequire(FONT_SPLIT_ADDON_SPEC))
  if (typeof fontSplitBinding.fontSplit !== 'function') {
    throw new TypeError('font-split addon loaded but fontSplit export is missing')
  }

  if (!quiet) {
    process.stdout.write(`SEA natives smoke passed: ${process.platform}-${process.arch}\n`)
  }
}

async function smokeWorker(): Promise<void> {
  bootstrapSeaRuntime()
  const bundlePath = seaAssetPath(SEA_SMOKE_WORKER_BUNDLE_KEY)
  const workerOptions = {
    argv: ['[worker eval]', ...process.argv.slice(2)],
    workerData: { kobatoSmokeWorker: true },
  }
  const worker =
    bundlePath !== null
      ? new Worker(readFileSync(bundlePath, 'utf-8'), {
          ...workerOptions,
          eval: true,
          execArgv: ['--input-type=module'],
        })
      : new Worker(new URL('./smoke-worker.mjs', import.meta.url), {
          argv: process.argv.slice(2),
          workerData: workerOptions.workerData,
        })
  worker.once('error', () => undefined)
  const [exitCode] = unsafeCast<[number]>(await once(worker, 'exit'))
  if (exitCode !== 0) {
    throw new Error(`smoke worker exited with code ${exitCode}`)
  }
}

async function smokeVfs(): Promise<void> {
  const root = seaVfsRoot()
  if (root === null) {
    throw new Error('SEA VFS is not mounted (not a useVfs single executable?)')
  }
  const topLevel = new Set(readdirSync(root))
  for (const expected of [
    SEA_CLIENT_ASSET_PREFIX.replace(/\/$/, ''),
    SEA_DRIZZLE_ASSET_PREFIX.replace(/\/$/, ''),
    SEA_NATIVE_ASSET_PREFIX.replace(/\/$/, ''),
    SEA_MANIFEST_KEY,
  ]) {
    if (!topLevel.has(expected)) {
      throw new Error(`SEA VFS layout is missing ${expected} (mount root has: ${[...topLevel].join(', ')})`)
    }
  }
  const manifest: unknown = JSON.parse(readFileSync(join(root, SEA_MANIFEST_KEY), 'utf-8'))
  if (typeof manifest !== 'object' || manifest === null || !('files' in manifest)) {
    throw new Error(`SEA manifest read through the VFS is malformed: ${SEA_MANIFEST_KEY}`)
  }
  try {
    writeFileSync(join(root, '.smoke-vfs-write'), 'nope')
    throw new Error('SEA VFS accepted a write — expected EROFS')
  } catch (error) {
    if (unsafeCast<{ code?: string }>(error).code !== 'EROFS') {
      throw error
    }
  }
  const tmpFile = join(mkdtempSync(join(tmpdir(), 'kobato-smoke-vfs-')), 'writev.bin')
  try {
    const chunk = Buffer.alloc(64 * 1024, 'a')
    const chunks = 64
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(tmpFile)
      stream.once('error', reject)
      for (let i = 0; i < chunks; i++) {
        stream.write(chunk)
      }
      stream.end(() => resolve())
    })
    const size = statSync(tmpFile).size
    if (size !== chunk.byteLength * chunks) {
      throw new Error(`writev smoke wrote ${size} bytes, expected ${chunk.byteLength * chunks}`)
    }
  } finally {
    rmSync(dirname(tmpFile), { recursive: true, force: true })
  }
  process.stdout.write(`SEA VFS smoke passed: ${root}\n`)
}

function probeConfig(): Promise<{ ok: boolean; issues: string[] }> {
  const explicit = parseConfigArg(process.argv.slice(2))
  const forward = explicit !== undefined ? ['--config', explicit] : []
  const res = spawnSync(process.execPath, ['--doctor-config-probe', ...forward], {
    encoding: 'utf-8',
    timeout: 30_000,
  })
  if (res.status === 0) {
    return Promise.resolve({ ok: true, issues: [] })
  }
  return Promise.resolve({ ok: false, issues: parseProbeIssues(res.stderr ?? '') })
}

async function doctor(json: boolean): Promise<void> {
  const report = await collectDoctorReport({
    version: __SEA_APP_VERSION__,
    sea: isSea(),
    checkNatives: () => smokeNatives(true),
    evaluateGate: evaluateSelfUpdateGate,
    probeConfig,
  })
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatDoctorText(report))
  if (!doctorOk(report)) {
    process.exit(1)
  }
}

async function main(args: ReadonlySet<string>): Promise<void> {
  if (args.has('--version') || args.has('-v')) {
    process.stdout.write(`kobato ${__SEA_APP_VERSION__}\n`)
    return
  }
  if (args.has('--help') || args.has('-h')) {
    process.stdout.write(USAGE)
    return
  }
  if (args.has('--smoke-natives')) {
    await smokeNatives()
    return
  }
  if (args.has('--smoke-worker')) {
    await smokeWorker()
  }
  if (args.has('--smoke-vfs')) {
    await smokeVfs()
  }
  if (args.has('--smoke-intl')) {
    runIntlProbe()
  }
  if (args.has('rollback')) {
    const { rolledBackTo, previousVersion } = await rollbackBinary()
    process.stdout.write(
      `Rolled back kobato ${previousVersion} → ${rolledBackTo}. ` +
        'Restart the service to run the restored build (e.g. systemctl restart <service>).\n',
    )
  }
  if (args.has('doctor')) {
    await doctor(args.has('--json'))
  }
  if (args.has('--doctor-config-probe')) {
    await import('@kobato/server/infra/config')
  }
}

const args = new Set(process.argv.slice(2))
const isFlagInvocation =
  args.has('--version') ||
  args.has('-v') ||
  args.has('--help') ||
  args.has('-h') ||
  args.has('--smoke-natives') ||
  args.has('--smoke-worker') ||
  args.has('--smoke-vfs') ||
  args.has('--smoke-intl') ||
  args.has('rollback') ||
  args.has('doctor') ||
  args.has('--doctor-config-probe')

installSeaVfsRuntimePatches()

if (isFlagInvocation) {
  try {
    await main(args)
  } catch (error) {
    process.stderr.write(`kobato: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exit(1)
  }
  process.exit(0)
}
