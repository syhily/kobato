import type { ProcessImageInput, ProcessedImage } from '@kobato/server/infra/image/process-worker'
import type { ImageOperation } from '@kobato/server/infra/trace/sanitize'

import { domainErrorFromWire } from '@kobato/server/infra/http/errors'
import { getProcessPool } from '@kobato/server/infra/image/process-pool'
import { processImageInWorker, WorkerDomainError } from '@kobato/server/infra/image/process-worker'
import { startSpan } from '@kobato/server/infra/trace/facade'
import { imageSizeBucket, recordImageExecution, recordImageQueue } from '@kobato/server/infra/trace/metrics'

export async function processImageBuffer(
  input: ProcessImageInput,
  operation: ImageOperation = 'unspecified',
): Promise<ProcessedImage> {
  if (import.meta.env.DEV) {
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

function rehydrateDomainError(err: unknown): unknown {
  if (err instanceof WorkerDomainError) {
    return domainErrorFromWire(err) ?? err
  }
  return err
}
