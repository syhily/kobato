import { describe, expect, it } from 'vitest'

import type { DomainErrorWire } from '@/server/infra/http/errors'
import type { AppLocale } from '@/shared/i18n/locales'

import { domainErrorFromWire } from '@/server/infra/http/errors'
import { createServerTranslator } from '@/server/infra/i18n'
import { WorkerDomainError } from '@/server/infra/image/process-worker'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// The image worker crosses a `worker_threads` postMessage boundary: the error
// travels as plain JSON, so the descriptor must survive `structuredClone` and
// rehydrate on the main thread without losing its typed id or ICU params.
function wireFromWorkerError(error: WorkerDomainError): DomainErrorWire {
  // Same shape `handle()` posts back.
  return structuredClone({
    name: error.name,
    code: error.code,
    message: error.message,
    issues: error.issues,
    ...(error.descriptor === undefined ? {} : { descriptor: error.descriptor }),
  })
}

const TOO_LARGE = new WorkerDomainError('BAD_REQUEST', 'The image is too large (limit 50 megapixels)', undefined, {
  messageKey: 'images.error.worker.tooLarge',
  params: { megapixels: 50 },
  fallbackMessage: 'The image is too large (limit 50 megapixels)',
})

describe('worker domain errors — descriptor survives the clone', () => {
  it('rehydrates the worker descriptor with its params intact', () => {
    const rehydrated = domainErrorFromWire(wireFromWorkerError(TOO_LARGE))
    expect(rehydrated).not.toBeNull()
    expect(rehydrated!.code).toBe('BAD_REQUEST')
    expect(rehydrated!.descriptor).toMatchObject({
      messageKey: 'images.error.worker.tooLarge',
      params: { megapixels: 50 },
    })
  })

  it.each(SUPPORTED_LOCALES)('localizes the cloned descriptor in %s', (locale: AppLocale) => {
    const wire = wireFromWorkerError(TOO_LARGE)
    const rehydrated = domainErrorFromWire(wire)!
    const message = createServerTranslator(locale).format(
      rehydrated.descriptor!.messageKey,
      rehydrated.descriptor!.params,
    )
    const expected: Record<AppLocale, string> = {
      'en-US': 'The image is too large (limit 50 megapixels)',
      'zh-CN': '图片尺寸过大（上限 50 百万像素）',
      'zh-TW': '圖片尺寸過大（上限 50 百萬像素）',
      'zh-HK': '圖片尺寸過大（上限 50 百萬像素）',
    }
    expect(message).toBe(expected[locale])
  })

  it('keeps the English fallback for an un-localized worker error', () => {
    const wire = wireFromWorkerError(TOO_LARGE)
    expect(wire.message).toBe('The image is too large (limit 50 megapixels)')
    expect(domainErrorFromWire(wire)!.message).toBe('The image is too large (limit 50 megapixels)')
  })

  it('rehydrates a worker error without a descriptor (legacy worker) as a raw message', () => {
    const legacy = new WorkerDomainError('BAD_REQUEST', 'legacy worker failure')
    const rehydrated = domainErrorFromWire(wireFromWorkerError(legacy))
    expect(rehydrated).not.toBeNull()
    expect(rehydrated!.descriptor).toBeUndefined()
    expect(rehydrated!.message).toBe('legacy worker failure')
  })

  it('returns null for a non-domain worker error', () => {
    expect(domainErrorFromWire(structuredClone({ name: 'Error', message: 'boom' }))).toBeNull()
  })
})
