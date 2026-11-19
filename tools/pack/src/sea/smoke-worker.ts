import { __setWorkerFactory, getProcessPool, stopProcessPool } from '@kobato/server/infra/image/process-pool.ts'
import { isSea } from '@kobato/server/infra/sea/sea.ts'
import { parentPort, Worker, workerData } from 'node:worker_threads'
import sharp from 'sharp'

const SOURCE_WIDTH = 64
const SOURCE_HEIGHT = 48
const TARGET_WIDTH = 32
const TARGET_HEIGHT = 24
const JPEG_QUALITY = 80

export async function run(): Promise<void> {
  if (!isSea()) {
    __setWorkerFactory(
      () => new Worker(new URL('../../../../apps/kobato/build/server/process-worker.js', import.meta.url)),
    )
  }

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
    await stopProcessPool()
  }

  process.stdout.write(`SEA worker smoke passed: ${process.platform}-${process.arch}\n`)
}

if (parentPort !== null && workerData?.kobatoSmokeWorker === true) {
  void run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exitCode = 1
  })
}
