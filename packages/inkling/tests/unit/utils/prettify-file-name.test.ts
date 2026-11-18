import prettifyFileName from '@kobato/inkling-internal/utils/prettify-file-name'
import { describe, expect, it } from 'vitest'

describe('prettifyFileName', () => {
  it('removes extension and replaces separators with spaces', () => {
    expect(prettifyFileName('my-file_name.jpg')).toBe('My file name')
  })

  it('capitalizes first letter', () => {
    expect(prettifyFileName('document.pdf')).toBe('Document')
  })

  it('returns empty string for null or undefined', () => {
    expect(prettifyFileName(null)).toBe('')
    expect(prettifyFileName(undefined)).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(prettifyFileName('')).toBe('')
  })
})
