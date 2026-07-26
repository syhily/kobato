// SEA command-line surface — evaluates FIRST in the injected server
// bundle (see `scripts/sea/server-entry.ts` for the evaluation-order
// contract). Owns `process.argv` handling inside the binary:
//
//   kobato --version | -v    print the baked-in version and exit
//   kobato --help | -h       print usage and exit
//   kobato --smoke-natives   extract + load the native libraries and exit
//   kobato --smoke-worker    round-trip a real sharp job through the
//                            worker_threads pool and exit (needs the
//                            server env vars — the pool graph validates
//                            env at import time)
//   (anything else)          fall through — `@/server/infra/sea-bootstrap`
//                            and then the server graph evaluate next
//
// --version/--help exit here with ZERO side effects (no natives
// extraction, no env validation) — they must stay ahead of both the
// bootstrap and the env-validated server graph. The smoke flags bootstrap
// the natives themselves (same code path as server startup) and then
// exit. Nothing in this module may touch the env-validated graph: it
// imports node builtins, `@/server/infra/sea`, `@/server/infra/sea-natives`,
// and constants only.
//
// `--smoke-worker` no longer materializes a bundle to disk (filesystem
// `import()` is forbidden in the injected script): the embedded
// `worker/smoke-worker.cjs` text is dispatched via
// `new Worker(code, { eval: true })` — the same mechanism the image
// process pool uses for `worker/process-worker.cjs`. Outside SEA the
// sibling bundle emitted by the same vite run is spawned as a file
// worker instead.

import { once } from 'node:events'
import { Worker } from 'node:worker_threads'

import { getEmbeddedAsset } from '@/server/infra/sea'
import { bootstrapSeaRuntime } from '@/server/infra/sea-natives'
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
                           @napi-rs/canvas), run a tiny render, and exit
  kobato --smoke-worker    Round-trip a real sharp job through the
                           worker_threads image pool and exit. Requires
                           the full configuration (validated, never
                           connected to).

Configuration:
  --config, -c <path>      Config file to use. Resolution order without it:
                           <binary dir>/kobato.config.json, then
                           ./kobato.config.json, then
                           ~/.config/kobato.config.json. The file is created
                           with defaults when missing.
  Environment variables    Override config values and are written back into
                           the file. Names follow the nested path with a
                           double underscore, e.g.:
                             database.url           → database__url
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
 * sharp / @napi-rs/canvas with their platform loads redirected to the
 * flat natives dir) plus one real operation per native library, so CI can
 * validate a freshly built binary without a database. Also works outside
 * SEA mode (resolves node_modules directly). The dynamic imports are
 * deliberate: sharp's platform detection runs at module evaluation and
 * needs `KOBATO_NATIVES_DIR` set first.
 */
async function smokeNatives(): Promise<void> {
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

  process.stdout.write(`SEA natives smoke passed: ${process.platform}-${process.arch}\n`)
}

/**
 * `--smoke-worker`: prove a real sharp job round-trips through the
 * production `worker_threads` image pool inside the binary — the gap
 * `--smoke-natives` (in-process load) cannot cover. The embedded
 * smoke-worker text pulls the env-validated graph (the pool registers its
 * teardown via `@/server/infra/lifecycle` → `@/server/infra/env`), so
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
  // Worker threads do NOT inherit the parent's argv (an eval worker sees
  // [execPath, '[worker eval]']). The smoke worker's env graph resolves
  // the config file from argv (`--config`), so forward this process's
  // args explicitly — otherwise its config resolution falls through to
  // the <execDir> candidate and writes a throwaway file next to the
  // binary. The worker also inherits this process's env at spawn, so the
  // natives dir set above is visible to it.
  const workerOptions = { argv: process.argv.slice(2), workerData: { kobatoSmokeWorker: true } }
  const worker =
    code !== null
      ? new Worker(code.toString('utf-8'), { ...workerOptions, eval: true })
      : // Non-SEA convenience: the sibling bundle from the same vite run.
        new Worker(new URL('./smoke-worker.cjs', import.meta.url), workerOptions)
  // The worker's own stdout/stderr are shared with this process (the
  // success line prints from inside it). Swallow the 'error' event — the
  // exit code carries the failure.
  worker.once('error', () => undefined)
  const [exitCode] = unsafeCast<[number]>(await once(worker, 'exit'))
  if (exitCode !== 0) {
    throw new Error(`smoke worker exited with code ${exitCode}`)
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
}

const args = new Set(process.argv.slice(2))
const isFlagInvocation =
  args.has('--version') ||
  args.has('-v') ||
  args.has('--help') ||
  args.has('-h') ||
  args.has('--smoke-natives') ||
  args.has('--smoke-worker')

if (isFlagInvocation) {
  try {
    await main(args)
  } catch (error) {
    process.stderr.write(`kobato: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exit(1)
  }
  process.exit(0)
}
