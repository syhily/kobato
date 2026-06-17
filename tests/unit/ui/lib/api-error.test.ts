import { describe, expect, it } from 'vitest'

import { extractApiErrorMessage, isApiAccepted } from '@/ui/lib/api-error'

describe('extractApiErrorMessage', () => {
  it('returns undefined for non-object inputs', () => {
    expect(extractApiErrorMessage('error')).toBeUndefined()
    expect(extractApiErrorMessage(42)).toBeUndefined()
    expect(extractApiErrorMessage(null)).toBeUndefined()
  })

  it('returns undefined when the payload has no error field', () => {
    expect(extractApiErrorMessage({ success: false })).toBeUndefined()
  })

  it('returns undefined when error is not an object', () => {
    expect(extractApiErrorMessage({ error: 'oops' })).toBeUndefined()
  })

  it('returns undefined when error has no message', () => {
    expect(extractApiErrorMessage({ error: { code: 'E123' } })).toBeUndefined()
  })

  it('returns the message when present', () => {
    expect(extractApiErrorMessage({ error: { message: 'Something went wrong' } })).toBe('Something went wrong')
  })

  it('ignores non-string messages', () => {
    expect(extractApiErrorMessage({ error: { message: 123 } })).toBeUndefined()
  })
})

describe('isApiAccepted', () => {
  it('returns false for non-object inputs', () => {
    expect(isApiAccepted(undefined)).toBe(false)
    expect(isApiAccepted('accepted')).toBe(false)
    expect(isApiAccepted(null)).toBe(false)
  })

  it('returns false when accepted is missing or not true', () => {
    expect(isApiAccepted({})).toBe(false)
    expect(isApiAccepted({ accepted: false })).toBe(false)
    expect(isApiAccepted({ accepted: 'true' })).toBe(false)
  })

  it('returns true when accepted is exactly true', () => {
    expect(isApiAccepted({ accepted: true })).toBe(true)
  })
})
