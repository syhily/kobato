// SEA worker-pool smoke — bundled by vite into
// `dist-sea/intermediates/smoke-worker.cjs` (see vite.sea.config.ts) and
// embedded as the `worker/smoke-worker.cjs` asset. The bundle's
// `--smoke-worker` flag (`@/server/infra/sea-cli`) dispatches it via
// `new Worker(code, { eval: true })` — the same mechanism the image
// process pool uses — with `workerData.kobatoSmokeWorker` set; the
// dual-mode entry at the bottom then invokes `run()`. Outside SEA the
// sibling bundle is spawned as a file worker instead.
//
// `--smoke-natives` loads sharp in the bundle's OWN process; this smoke
// instead proves the production image pipeline end to end: a real job is
// dispatched into the `worker_threads` pool (spawned from the embedded
// `worker/process-worker.cjs` text via `new Worker(code, { eval: true })`
// under SEA), sharp decodes/resizes/re-encodes inside the worker, and the
// result round-trips back to this process.
//
// Unlike the other binary flags this module DOES pull the env-validated
// server graph: the pool registers its teardown via
// `@/server/infra/lifecycle`, which imports `@/server/infra/env` and exits
// when required variables are missing. `--smoke-worker` therefore needs
// the full server configuration (database.url, security.sessionSecret,
// security.encryptionKey, storage.data) — it validates but never opens a
// connection.
//
// The static sharp import is safe at module scope: this bundle is only
// ever run AFTER `bootstrapSeaRuntime()` (or outside SEA, where the
// redirected loads fall back to node_modules resolution).

import { parentPort, Worker, workerData } from 'node:worker_threads'
import sharp from 'sharp'

import { __setWorkerFactory, getProcessPool, stopProcessPool } from '@/server/infra/image/process-pool'
import { isSea } from '@/server/infra/sea'

const SOURCE_WIDTH = 64
const SOURCE_HEIGHT = 48
const TARGET_WIDTH = 32
const TARGET_HEIGHT = 24
const JPEG_QUALITY = 80

/**
 * Run one real job through the production worker pool, assert the
 * processed result, and tear the pool down so the CLI can exit.
 */
export async function run(): Promise<void> {
  // Non-SEA convenience (`node dist-sea/intermediates/server.mjs
  // --smoke-worker`): the pool's default worker URL resolves relative to
  // the bundled module's own location, and no worker file sits next to
  // this bundle — point the factory hook at the vite-built worker instead
  // (exists after `pnpm run build`). SEA mode keeps the default
  // embedded-text eval worker — that path is what this smoke exists to
  // prove.
  if (!isSea()) {
    __setWorkerFactory(() => new Worker(new URL('../../build/server/process-worker.js', import.meta.url)))
  }

  // Synthesize a real PNG from raw pixels — a deterministic gradient, not
  // a flat fill, so the JPEG re-encode has real entropy to chew on.
  const raw = Buffer.alloc(SOURCE_WIDTH * SOURCE_HEIGHT * 3)
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = i % 256
  }
  const png = await sharp(raw, { raw: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, channels: 3 } })
    .png()
    .toBuffer()

  try {
    const pool = await getProcessPool()
    const result = await pool.process({
      buffer: png,
      jpegQuality: JPEG_QUALITY,
      resize: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
    })

    if (pool.stats().size === 0) {
      throw new Error('process pool reports zero workers — the job did not round-trip through worker_threads')
    }
    if (result.width !== TARGET_WIDTH || result.height !== TARGET_HEIGHT) {
      throw new Error(`unexpected dimensions ${result.width}x${result.height}, want ${TARGET_WIDTH}x${TARGET_HEIGHT}`)
    }
    if (result.byteSize === 0 || result.buffer.byteLength !== result.byteSize) {
      throw new Error('processed buffer is empty or byteSize does not match the buffer')
    }
    if (typeof result.thumbhash !== 'string' || result.thumbhash.length === 0) {
      throw new Error('thumbhash missing from the processed result')
    }
    const meta = await sharp(result.buffer, { failOn: 'error' }).metadata()
    if (meta.format !== 'jpeg' || meta.width !== TARGET_WIDTH || meta.height !== TARGET_HEIGHT) {
      throw new Error(`re-encoded output is not the expected ${TARGET_WIDTH}x${TARGET_HEIGHT} jpeg`)
    }
  } finally {
    // CRITICAL: terminate the workers — an idle pool keeps the event loop
    // alive and the CLI would never exit.
    await stopProcessPool()
  }

  process.stdout.write(`SEA worker smoke passed: ${process.platform}-${process.arch}\n`)
}

// Dual-mode entry: when the bundle's `--smoke-worker` handler dispatches
// this bundle as a worker (`workerData.kobatoSmokeWorker` — see
// `@/server/infra/sea-cli`), run immediately and report through the exit
// code. Plain imports (tests, direct module use) skip this branch.
if (parentPort !== null && workerData?.kobatoSmokeWorker === true) {
  void run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exitCode = 1
  })
}
