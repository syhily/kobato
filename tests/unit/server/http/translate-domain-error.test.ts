import { describe, expect, it } from 'vitest'

import { translateDomainError } from '@/server/http/translate-domain-error'
import { ActionFailure, DomainError } from '@/server/infra/http/errors'

describe('server/http/translate-domain-error — translateDomainError', () => {
  it('maps a DomainError code to its HTTP status and forwards message + issues', () => {
    const issues = [{ message: 'unknown key', path: ['seo'] }]
    const translated = translateDomainError(new DomainError('BAD_REQUEST', 'bad patch', issues))
    expect(translated).toEqual({ status: 400, message: 'bad patch', issues, headers: undefined })
  })

  it('uses the DomainError default message when none is given', () => {
    const translated = translateDomainError(new DomainError('NOT_FOUND'))
    expect(translated.status).toBe(404)
    expect(translated.message).toBe('资源不存在。')
    expect(translated.issues).toBeUndefined()
  })

  it('maps every DomainError code through domainStatus', () => {
    expect(translateDomainError(new DomainError('RATE_LIMITED')).status).toBe(429)
    expect(translateDomainError(new DomainError('CONFLICT')).status).toBe(409)
    expect(translateDomainError(new DomainError('INTERNAL')).status).toBe(500)
  })

  it('forwards ActionFailure status, message, issues, and headers', () => {
    const issues = [{ message: 'dup' }]
    const headers = { 'Retry-After': '30' }
    const translated = translateDomainError(new ActionFailure(429, 'slow down', issues, headers))
    expect(translated).toEqual({ status: 429, message: 'slow down', issues, headers })
  })

  it('leaves issues and headers undefined for a bare ActionFailure', () => {
    const translated = translateDomainError(new ActionFailure(503, 'upload disabled'))
    expect(translated).toEqual({ status: 503, message: 'upload disabled', issues: undefined, headers: undefined })
  })
})
