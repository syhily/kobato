import { describe, expect, it } from 'vitest'

import { corpusText } from '@/server/infra/search/corpus'

describe('infra/search — corpusText', () => {
  it('joins title, summary, and plainText in corpus-field order', () => {
    expect(corpusText({ title: 'T', summary: 'S', plainText: 'P' })).toBe('T\nS\nP')
  })

  it('trims surrounding whitespace (e.g. an empty plainText tail)', () => {
    expect(corpusText({ title: 'T', summary: '', plainText: '' })).toBe('T')
  })
})
