import type { ProcessImageInput, ProcessedImage } from '@/server/infra/image/process-worker'
import type { ImageOperation } from '@/server/infra/trace/sanitize'

import { domainErrorFromWire } from '@/server/infra/http/errors'
import { getProcessPool } from '@/server/infra/image/process-pool'
import { processImageInWorker, WorkerDomainError } from '@/server/infra/image/process-worker'
import { startSpan } from '@/server/infra/trace/facade'
import { imageSizeBucket, recordImageExecution, recordImageQueue } from '@/server/infra/trace/metrics'

/**
 * Decode / resize / re-encode an uploaded image (worker pool in prod,
 * inline in dev); inline `WorkerDomainError`s come back as `DomainError`s.
 */
export async function processImageBuffer(
  input: ProcessImageInput,
  operation: ImageOperation = 'unspecified',
): Promise<ProcessedImage> {
  if (import.meta.env.DEV) {
    // The dev server runs the transform inline, so the pool's queue/execution
    // telemetry never fires; record both boundaries directly so the metric
    // stream exists (queue wait is zero by construction).
    const sizeBucket = imageSizeBucket(input.buffer.byteLength)
    recordImageQueue(operation, sizeBucket, 0)
    const startedAt = performance.now()
    const span = startSpan('image.worker', {
      attributes: { 'image.operation': operation, 'image.size_bucket': sizeBucket },
    })
    try {
      const result = await processImageInWorker(input)
      span.setAttribute('image.outcome', 'success')
      span.setStatus('ok')
      span.end()
      recordImageExecution(operation, sizeBucket, performance.now() - startedAt, 'success')
      return result
    } catch (err) {
      span.setAttribute('image.outcome', 'error')
      span.setStatus('error')
      span.end()
      recordImageExecution(operation, sizeBucket, performance.now() - startedAt, 'error')
      throw rehydrateDomainError(err)
    }
  }
  const pool = await getProcessPool()
  return pool.process(input, operation)
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
