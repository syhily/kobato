import { stripL3Markers, tagL3InDetails } from '@kobato/server/domains/audit/privacy'
import { describe, expect, it } from 'vitest'

describe('audit/privacy', () => {
  describe('tagL3InDetails', () => {
    it('wraps email values in {E}…{/E}', () => {
      const result = tagL3InDetails({ email: 'test@example.com' })
      expect(result).toEqual({ email: '{E}test@example.com{/E}' })
    })

    it('does not wrap non-sensitive keys', () => {
      const result = tagL3InDetails({ title: 'Post Title', count: 42 })
      expect(result).toEqual({ title: 'Post Title', count: 42 })
    })

    it('skips already-tagged values', () => {
      const result = tagL3InDetails({ email: '{E}already-tagged{/E}' })
      expect(result).toEqual({ email: '{E}already-tagged{/E}' })
    })

    it('recursively walks nested objects', () => {
      const result = tagL3InDetails({
        meta: { email: 'nested@example.com' },
        flat: 'safe',
      })
      expect(result).toEqual({
        meta: { email: '{E}nested@example.com{/E}' },
        flat: 'safe',
      })
    })

    it('walks objects inside arrays', () => {
      const result = tagL3InDetails({
        items: [{ email: 'arr@example.com' }, { email: 'brr@example.com' }],
      })
      expect(result).toEqual({
        items: [{ email: '{E}arr@example.com{/E}' }, { email: '{E}brr@example.com{/E}' }],
      })
    })

    it('does not over-tag generic "name" keys', () => {
      const result = tagL3InDetails({ name: 'Category Name' })
      expect(result).toEqual({ name: 'Category Name' })
    })

    it('returns undefined for undefined input', () => {
      expect(tagL3InDetails(undefined)).toBeUndefined()
    })
  })

  describe('stripL3Markers', () => {
    it('masks tagged strings to ***', () => {
      const result = stripL3Markers({ email: '{E}secret{/E}' })
      expect(result).toEqual({ email: '***' })
    })

    it('leaves untagged strings alone', () => {
      const result = stripL3Markers({ title: 'Public Title' })
      expect(result).toEqual({ title: 'Public Title' })
    })
  })
})
