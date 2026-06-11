import { describe, expect, it } from 'vitest'

import { extractZodIssues } from '@/server/domains/content/save-helpers'

describe('content/save-helpers — extractZodIssues', () => {
  it('returns undefined for null', () => {
    expect(extractZodIssues(null)).toBeUndefined()
  })

  it('returns undefined for non-object primitives', () => {
    expect(extractZodIssues('string')).toBeUndefined()
    expect(extractZodIssues(42)).toBeUndefined()
    expect(extractZodIssues(true)).toBeUndefined()
  })

  it('returns undefined when issues is not an array', () => {
    expect(extractZodIssues({ issues: 'not-array' })).toBeUndefined()
    expect(extractZodIssues({ issues: null })).toBeUndefined()
  })

  it('returns undefined when issues property is missing', () => {
    expect(extractZodIssues({ foo: 'bar' })).toBeUndefined()
  })

  it('extracts message and path from Zod-like error objects', () => {
    const error = {
      issues: [
        { message: 'Required', path: ['body', 0, 'text'] },
        { message: 'Invalid type', path: ['title'] },
      ],
    }
    const result = extractZodIssues(error)
    expect(result).toEqual([
      { message: 'Required', path: ['body', '0', 'text'] },
      { message: 'Invalid type', path: ['title'] },
    ])
  })

  it('filters out non-object entries in issues array', () => {
    const error = {
      issues: [{ message: 'Valid issue', path: ['field'] }, null, 42, 'bad', { message: 'Another valid', path: [] }],
    }
    const result = extractZodIssues(error)
    expect(result).toEqual([
      { message: 'Valid issue', path: ['field'] },
      { message: 'Another valid', path: [] },
    ])
  })

  it('defaults message to "invalid body" when message is not a string', () => {
    const error = {
      issues: [{ message: 123, path: ['field'] }],
    }
    const result = extractZodIssues(error)
    expect(result).toEqual([{ message: 'invalid body', path: ['field'] }])
  })

  it('returns undefined for path when path is not an array', () => {
    const error = {
      issues: [{ message: 'Error', path: 'not-array' }],
    }
    const result = extractZodIssues(error)
    expect(result).toEqual([{ message: 'Error', path: undefined }])
  })

  it('returns empty array when issues is an empty array', () => {
    const error = { issues: [] }
    const result = extractZodIssues(error)
    expect(result).toEqual([])
  })
})
