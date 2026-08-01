// SEA command-line surface — evaluates FIRST in the injected server
// bundle (see `scripts/sea/server-entry.ts` for the evaluation-order
// contract). Owns `process.argv` handling inside the binary:
//
//   kobato --version | -v    print the baked-in version and exit
//   kobato --help | -h       print usage and exit
//   kobato --smoke-natives   extract + load the native libraries and exit
//   kobato --smoke-worker    round-trip a real sharp job through the
//                            worker_threads pool and exit (needs the
//                            server config — the pool graph validates
//                            it at import time)
//   kobato rollback          swap the `<binary>.bak` sibling left by the
//                            self-update pipeline back into place and exit
//   kobato doctor [--json]   aggregate diagnostics: version, natives smoke,
//                            self-update gate, config validation; exit 1
//                            when natives or config fail
//   kobato --doctor-config-probe
//                            hidden helper: validates the configuration by
//                            loading the config graph, exits accordingly —
//                            `doctor` spawns it so a failing config cannot
//                            kill the diagnostic report mid-aggregation
//   (anything else)          fall through — `@/server/infra/sea-bootstrap`
//                            and then the server graph evaluate next
//
// --version/--help exit here with ZERO side effects (no natives
// extraction, no env validation) — they must stay ahead of both the
// bootstrap and the env-validated server graph. The smoke flags bootstrap
// the natives themselves (same code path as server startup) and then
// exit. Nothing in this module may touch the env-validated graph: it
// imports node builtins, `@/server/infra/sea`, `@/server/infra/sea-natives`,
// and constants only — plus `@/server/infra/binary-rollback`,
// `@/server/infra/self-update-gate` and `@/server/infra/doctor-report`, which
// are held to the same builtins-and-constants budget by their own headers.
// The config graph stays behind a DYNAMIC import in `--doctor-config-probe`:
// evaluating it validates the configuration and exits the process, which is
// exactly the probe semantics — and must never happen for the other flags.
//
// `--smoke-worker` no longer materializes a bundle to disk (filesystem
// `import()` is forbidden in the injected script): the embedded
// `worker/smoke-worker.mjs` text is dispatched via
// `new Worker(code, { eval: true, execArgv: ['--input-type=module'] })` —
// the same mechanism the image process pool uses for
// `worker/process-worker.mjs`. Outside SEA the sibling bundle emitted by
// the same vite run is spawned as a file worker instead.

import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'

import { rollbackBinary } from '@/server/infra/binary-rollback'
import { collectDoctorReport, doctorOk, formatDoctorText, parseProbeIssues } from '@/server/infra/doctor-report'
import { getEmbeddedAsset, isSea } from '@/server/infra/sea'
import { bootstrapSeaRuntime } from '@/server/infra/sea-natives'
import { evaluateSelfUpdateGate } from '@/server/infra/self-update-gate'
import { SEA_SMOKE_WORKER_BUNDLE_KEY } from '@/shared/sea/assets'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Baked at build time by vite (`define` in vite.sea.config.ts) from
// package.json — a single executable has no package.json to read at
// runtime. The `declare const` emits no code; only usage sites are
// replaced.
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

/**
 * `--smoke-natives`: prove the embedded native libraries extract and load.
 * Runs the same code path as server startup (`bootstrapSeaRuntime`, then
 * sharp / @napi-rs/canvas / @duckdb/node-api with their platform loads
 * redirected to the flat natives dir) plus one real operation per native
 * library, so CI can validate a freshly built binary without a database.
 * Also works outside SEA mode (resolves node_modules directly). The
 * dynamic imports are deliberate: sharp's platform detection runs at
 * module evaluation and needs `KOBATO_NATIVES_DIR` set first.
 */
async function smokeNatives(quiet = false): Promise<void> {
  bootstrapSeaRuntime()

  // sharp: raw pixels -> PNG encode -> JPEG re-encode.
  const { default: sharp } = await import('sharp')
  const rawPixels = Buffer.alloc(8 * 8 * 3, 128)
  const png = await sharp(rawPixels, { raw: { width: 8, height: 8, channels: 3 } })
    .png()
    .toBuffer()
  const reencoded = await sharp(png, { failOn: 'error' }).jpeg().toBuffer()
  if (reencoded.byteLength === 0) {
    throw new Error('sharp re-encode produced an empty buffer')
  }

  // @napi-rs/canvas: fill a tiny canvas and encode it as PNG.
  const { createCanvas } = await import('@napi-rs/canvas')
  const canvas = createCanvas(8, 8)
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgb(128, 128, 128)'
  context.fillRect(0, 0, 8, 8)
  if (canvas.toBuffer('image/png').byteLength === 0) {
    throw new Error('@napi-rs/canvas PNG encode produced an empty buffer')
  }

  // @duckdb/node-api: in-memory instance, one row in, one aggregate out.
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

/**
 * `--smoke-worker`: prove a real sharp job round-trips through the
 * production `worker_threads` image pool inside the binary — the gap
 * `--smoke-natives` (in-process load) cannot cover. The embedded
 * smoke-worker text pulls the config-validated graph (the pool registers its
 * teardown via `@/server/infra/lifecycle` → `@/server/infra/config`), so
 * this flag legitimately requires the full server environment —
 * validated, never connected to. The worker inherits this process's env
 * at spawn, so the natives dir set above is visible to it.
 */
async function smokeWorker(): Promise<void> {
  // Extract the natives and set KOBATO_NATIVES_DIR FIRST (sync) — the
  // dispatched worker (and the pool's workers inside it) evaluate their
  // bundled sharp at module scope.
  bootstrapSeaRuntime()
  const code = getEmbeddedAsset(SEA_SMOKE_WORKER_BUNDLE_KEY)
  // Worker threads do NOT inherit the parent's argv. The smoke worker's
  // env graph resolves the config file from argv (`--config`), so forward
  // this process's args explicitly — otherwise its config resolution
  // falls through to the <execDir> candidate and writes a throwaway file
  // next to the binary. The '[worker eval]' placeholder keeps the
  // forwarded args at process.argv[2:]: the classic eval path splices
  // that name into argv[1] itself, but the module eval path
  // (--input-type=module) does NOT — without the placeholder every
  // `process.argv.slice(2)` in the worker is off by one and `--config`
  // is silently dropped. The worker also inherits this process's env at
  // spawn, so the natives dir set above is visible to it.
  const workerOptions = {
    argv: ['[worker eval]', ...process.argv.slice(2)],
    workerData: { kobatoSmokeWorker: true },
  }
  const worker =
    code !== null
      ? // `--input-type=module`: run the eval'd ESM bundle as a module
        // explicitly (see the image process pool for why it matters).
        new Worker(code.toString('utf-8'), { ...workerOptions, eval: true, execArgv: ['--input-type=module'] })
      : // Non-SEA convenience: the sibling bundle from the same vite run.
        new Worker(new URL('./smoke-worker.mjs', import.meta.url), {
          argv: process.argv.slice(2),
          workerData: workerOptions.workerData,
        })
  // The worker's own stdout/stderr are shared with this process (the
  // success line prints from inside it). Swallow the 'error' event — the
  // exit code carries the failure.
  worker.once('error', () => undefined)
  const [exitCode] = unsafeCast<[number]>(await once(worker, 'exit'))
  if (exitCode !== 0) {
    throw new Error(`smoke worker exited with code ${exitCode}`)
  }
}

/**
 * Config probe for `doctor`: re-exec this binary with the hidden
 * `--doctor-config-probe` flag (forwarding any `--config` argument), where
 * loading the config graph IS the validation — `loadServerConfig` prints
 * the issues and exits 1 on failure, so the parent never has to import the
 * env-validated graph itself. Exit 0 means the configuration validates.
 */
function probeConfig(): Promise<{ ok: boolean; issues: string[] }> {
  const forward: string[] = []
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--config' || arg === '-c') {
      const next = argv[i + 1]
      if (next !== undefined) {
        forward.push(arg, next)
        i++
      }
    } else if (arg.startsWith('--config=')) {
      forward.push(arg)
    }
  }
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
    // Importing the config graph validates the configuration as a module
    // side effect: `loadServerConfig` prints the issue list and exits 1 on
    // failure; reaching this line means the configuration is valid.
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
