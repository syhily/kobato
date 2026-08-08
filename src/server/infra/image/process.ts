import type { ProcessImageInput, ProcessedImage } from '@/server/infra/image/process-worker'

import { domainErrorFromWire } from '@/server/infra/http/errors'
import { getProcessPool } from '@/server/infra/image/process-pool'
import { processImageInWorker, WorkerDomainError } from '@/server/infra/image/process-worker'

/**
 * Decode / resize / re-encode an uploaded image (worker pool in prod,
 * inline in dev); inline `WorkerDomainError`s come back as `DomainError`s.
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
 * Re-hydrate a `WorkerDomainError` into a real `DomainError`; others pass through.
 */
function rehydrateDomainError(err: unknown): unknown {
  if (err instanceof WorkerDomainError) {
    return domainErrorFromWire(err) ?? err
  }
  return err
}
