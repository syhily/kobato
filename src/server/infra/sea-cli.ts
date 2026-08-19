// SEA command-line surface — evaluates FIRST in the injected server bundle.
// Flags: --version|-v, --help|-h, --smoke-natives, --smoke-worker, rollback,
// doctor [--json], hidden --doctor-config-probe; anything else falls through
// to the server graph.
// --version/--help exit with ZERO side effects; nothing here may touch the
// env-validated graph (config loads only behind the probe's dynamic import).
// --smoke-worker dispatches the embedded bundle via new Worker(code, { eval: true })
// — never materializes to disk.

import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'

import { rollbackBinary } from '@/server/infra/binary-rollback'
import { parseConfigArg } from '@/server/infra/config-arg'
import { collectDoctorReport, doctorOk, formatDoctorText, parseProbeIssues } from '@/server/infra/doctor-report'
import { getEmbeddedAsset, isSea } from '@/server/infra/sea'
import { bootstrapSeaRuntime } from '@/server/infra/sea-natives'
import { evaluateSelfUpdateGate } from '@/server/infra/self-update-gate'
import { SEA_SMOKE_WORKER_BUNDLE_KEY } from '@/shared/sea/assets'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Baked at build time by vite define — a single executable has no package.json.
declare const __SEA_APP_VERSION__: string

const USAGE = `kobato — self-hosted blog CMS (single executable)

Usage:
  kobato                   Start the server (see configuration below)
  kobato --version, -v     Print the version and exit
  kobato --help, -h        Print this help and exit
  kobato --smoke-natives   Extract and load the native packages (sharp,
                           @napi-rs/canvas, @duckdb/node-api), run a tiny
                           render + a tiny aggregate, and exit
  kobato --smoke-worker    Round-trip a real sharp job through the
                           worker_threads image pool and exit. Requires
                           the full configuration (validated, never
                           connected to).
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

/** Prove the embedded natives extract and load, one real operation each.
 * Dynamic imports after bootstrapSeaRuntime — sharp's platform detection
 * runs at module evaluation and needs KOBATO_NATIVES_DIR set first. */
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

  const { DuckDBInstance } = await import('@duckdb/node-api')
  const duckdb = await DuckDBInstance.create()
  const connection = await duckdb.connect()
  await connection.run('CREATE TABLE smoke (n INTEGER)')
  await connection.run('INSERT INTO smoke VALUES (1), (2), (3)')
  const result = await connection.runAndReadAll('SELECT sum(n) AS total FROM smoke')
  const total = result.getRowObjects()[0]?.total
  connection.closeSync()
  duckdb.closeSync()
  if (Number(total) !== 6) {
    throw new Error(`@duckdb/node-api aggregate returned ${String(total)}, expected 6`)
  }

  if (!quiet) {
    process.stdout.write(`SEA natives smoke passed: ${process.platform}-${process.arch}\n`)
  }
}

/** Prove a sharp job round-trips the production worker pool — the gap
 * in-process smoke cannot cover. Requires the full server config
 * (validated, never connected). */
async function smokeWorker(): Promise<void> {
  // Extract natives and set KOBATO_NATIVES_DIR first — the worker evaluates bundled sharp at module scope.
  bootstrapSeaRuntime()
  const code = getEmbeddedAsset(SEA_SMOKE_WORKER_BUNDLE_KEY)
  // Worker threads don't inherit argv — forward it; the '[worker eval]'
  // placeholder keeps process.argv.slice(2) aligned, or --config is dropped.
  const workerOptions = {
    argv: ['[worker eval]', ...process.argv.slice(2)],
    workerData: { kobatoSmokeWorker: true },
  }
  const worker =
    code !== null
      ? // eval: true + --input-type=module runs the ESM bundle as a module.
        new Worker(code.toString('utf-8'), { ...workerOptions, eval: true, execArgv: ['--input-type=module'] })
      : // Non-SEA convenience: the sibling bundle from the same vite run.
        new Worker(new URL('./smoke-worker.mjs', import.meta.url), {
          argv: process.argv.slice(2),
          workerData: workerOptions.workerData,
        })
  // Shared stdio with this process; swallow 'error' — the exit code carries the failure.
  worker.once('error', () => undefined)
  const [exitCode] = unsafeCast<[number]>(await once(worker, 'exit'))
  if (exitCode !== 0) {
    throw new Error(`smoke worker exited with code ${exitCode}`)
  }
}

/** Re-exec with --doctor-config-probe (forwarding --config): loading the
 * config graph IS the validation — exit 0 means it validates. */
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
    // Importing the config graph validates the configuration as a module side effect.
    await import('@/server/infra/config')
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
  args.has('rollback') ||
  args.has('doctor') ||
  args.has('--doctor-config-probe')

if (isFlagInvocation) {
  try {
    await main(args)
  } catch (error) {
    process.stderr.write(`kobato: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exit(1)
  }
  process.exit(0)
}
