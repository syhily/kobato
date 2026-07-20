// SEA prelude — the CJS main baked into the single-executable binary.
//
// tsdown bundles this module into `dist-sea/intermediates/main.cjs`; see
// `scripts/sea/build.ts` for the full pipeline. At runtime inside the
// binary the prelude runs first and owns `process.argv` handling:
//
//   kobato --version | -v    print the baked-in version and exit
//   kobato --help | -h       print usage and exit
//   kobato --smoke-natives   extract + load the native packages and exit
//   kobato --smoke-worker    round-trip a real sharp job through the
//                            worker_threads pool and exit (needs the
//                            server env vars — the pool graph validates
//                            env at import time)
//   kobato                   extract natives, then start the server
//
// Module-scope imports stay limited to `@/server/infra/sea`,
// `@/server/infra/sea-natives`, and `@/shared/utils/unsafe-cast` (plus
// node builtins): all are side-effect-free at import time and never touch
// the env-validated server graph — the flags above must work with zero
// environment variables set. The server itself is loaded exclusively
// through the dynamic import in `main()`, AFTER `bootstrapSeaRuntime()`
// has set `KOBATO_NATIVES_DIR`, because server modules call
// `requireExternal` (sharp, @napi-rs/canvas) at module scope.
//
// The server graph is NOT part of this bundle: `src/server.ts` uses
// top-level await, which bundlers cannot express in CJS. It ships as a
// separate single-file ESM bundle (`server.mjs`, embedded as the
// `server/server.mjs` asset) that `bootstrapSeaRuntime()` materializes
// into the natives cache dir. Outside SEA mode (e.g. `node
// dist-sea/intermediates/main.cjs` under plain Node) the bootstrap is a
// no-op and the import falls back to the sibling `server.mjs` emitted by
// the same tsdown run — the file stays directly runnable.

import type sharpDefault from 'sharp'

import { pathToFileURL } from 'node:url'

import { requireExternal } from '@/server/infra/sea'
import { bootstrapSeaRuntime, materializeSmokeWorkerBundle } from '@/server/infra/sea-natives'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Baked at build time by tsdown (`define` in tsdown.sea.config.ts) from
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
                             redis.url              → redis__url
                             auth.sessionSecret     → auth__sessionSecret
                             security.encryptionKey → security__encryptionKey
                             paths.data             → paths__data

Optional environment variables:
  KOBATO_CACHE_DIR Cache directory for extracted native packages
                   (default: $XDG_CACHE_HOME/kobato or ~/.cache/kobato)
`

/**
 * `--smoke-natives`: prove the embedded native packages extract and load.
 * Runs the same code path as server startup (`bootstrapSeaRuntime` +
 * `requireExternal`) plus one real operation per native library, so CI
 * can validate a freshly built binary without a database. Also works
 * outside SEA mode (resolves node_modules directly).
 */
async function smokeNatives(): Promise<void> {
  bootstrapSeaRuntime()

  // sharp: raw pixels -> PNG encode -> JPEG re-encode.
  const sharp = requireExternal<typeof sharpDefault>('sharp')
  const rawPixels = Buffer.alloc(8 * 8 * 3, 128)
  const png = await sharp(rawPixels, { raw: { width: 8, height: 8, channels: 3 } })
    .png()
    .toBuffer()
  const reencoded = await sharp(png, { failOn: 'error' }).jpeg().toBuffer()
  if (reencoded.byteLength === 0) {
    throw new Error('sharp re-encode produced an empty buffer')
  }

  // @napi-rs/canvas: fill a tiny canvas and encode it as PNG.
  const { createCanvas } = requireExternal<typeof import('@napi-rs/canvas')>('@napi-rs/canvas')
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
 * `--smoke-natives` (in-process load) cannot cover. The pool module graph
 * imports `@/server/infra/env` (via the lifecycle shutdown hooks), which
 * exits when required env vars are missing, so this flag legitimately
 * requires the full server environment — validated, never connected to.
 */
async function smokeWorker(): Promise<void> {
  // Extract the natives and set KOBATO_NATIVES_DIR FIRST (sync) — the
  // pool's workers call `requireExternal('sharp')` at module scope.
  bootstrapSeaRuntime()
  // Materialize the embedded smoke-worker bundle the same way the server
  // bundle is materialized (sha256-verified, atomic write, cache reuse).
  // Outside SEA mode this is a no-op and the sibling `smoke-worker.cjs`
  // emitted by the same tsdown run is imported instead.
  const smokeWorkerPath = materializeSmokeWorkerBundle()
  const moduleUrl =
    smokeWorkerPath !== null ? pathToFileURL(smokeWorkerPath).href : new URL('smoke-worker.cjs', import.meta.url).href
  // The dynamic-import boundary is untyped by nature; the smoke-worker
  // bundle is built from `scripts/sea/smoke-worker.ts`, which exports
  // exactly this shape.
  const mod = unsafeCast<{ run(this: void): Promise<void> }>(await import(moduleUrl))
  await mod.run()
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))

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
    return
  }

  // Normal server start: extract natives + materialize the server bundle
  // FIRST (sync) — server modules call `requireExternal` at module scope,
  // so `KOBATO_NATIVES_DIR` must be set before any of them evaluate. The
  // specifier is intentionally non-static: the server graph must stay out
  // of this CJS bundle (top-level await, see the header comment).
  const serverBundlePath = bootstrapSeaRuntime()
  const serverUrl =
    serverBundlePath !== null ? pathToFileURL(serverBundlePath).href : new URL('server.mjs', import.meta.url).href
  await import(serverUrl)
}

void main().catch((error: unknown) => {
  process.stderr.write(`kobato: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
