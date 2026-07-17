import type { ProcessImageInput, ProcessedImage } from '@/server/infra/image/process-worker'

import { DOMAIN_ERROR_CODES, DomainError, type DomainErrorCode } from '@/server/infra/http/errors'
import { getProcessPool } from '@/server/infra/image/process-pool'
import { processImageInWorker, WorkerDomainError } from '@/server/infra/image/process-worker'

/**
 * Process an uploaded image buffer: decode, optional resize, re-encode to
 * progressive mozjpeg JPEG, and compute a ThumbHash placeholder.
 *
 * In production the work runs inside a `worker_threads` pool (see
 * `process-pool.ts`) so the decode + resize + re-encode + thumbhash
 * pipeline — typically 200–800ms — never blocks the request thread.
 *
 * In development the same pure function runs inline to keep HMR fast and
 * avoid worker spawn churn on every reload. `WorkerDomainError` thrown
 * by the inline path is re-thrown as a real `DomainError` so callers see
 * the exact same exception type in both modes.
 */
export async function processImageBuffer(input: ProcessImageInput): Promise<ProcessedImage> {
  if (import.meta.env.DEV) {
    try {
      return await processImageInWorker(input)
    } catch (err) {
      throw rehydrateDomainError(err)
    }
  }
  const pool = await getProcessPool()
  return pool.process(input)
}

/**
 * Convert a `WorkerDomainError` (used inside the worker isolate to avoid
 * importing the real `DomainError` class, which pulls in `pg`) back into a
 * proper `DomainError` on the main thread. Non-domain errors pass through
 * unchanged.
 */
function rehydrateDomainError(err: unknown): unknown {
  if (err instanceof WorkerDomainError && isDomainErrorCode(err.code)) {
    return new DomainError(err.code, err.message, err.issues)
  }
  return err
}

function isDomainErrorCode(code: string): code is DomainErrorCode {
  return (DOMAIN_ERROR_CODES as readonly string[]).includes(code)
}
