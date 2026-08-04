import { parseCommentFiltersFromSearchParams } from '@kobato/ui/admin/comments/useCommentsController'
import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/comments'

describe('route: admin/comments', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '评论管理 - 且听书吟' })
    })
  })

  describe('parseCommentFiltersFromSearchParams', () => {
    it('returns an empty array when no filters are present', () => {
      const params = new URLSearchParams()
      expect(parseCommentFiltersFromSearchParams(params)).toEqual([])
    })

    it('parses a status filter (excluding all)', () => {
      const params = new URLSearchParams({ status: 'pending' })
      const filters = parseCommentFiltersFromSearchParams(params)
      expect(filters).toEqual([{ field: 'status', value: 'pending', label: '待审核' }])
    })

    it('ignores status=all', () => {
      const params = new URLSearchParams({ status: 'all' })
      expect(parseCommentFiltersFromSearchParams(params)).toEqual([])
    })

    it('parses pageKey and userId filters', () => {
      const params = new URLSearchParams({ pageKey: '/posts/hello', userId: '42' })
      const filters = parseCommentFiltersFromSearchParams(params)
      expect(filters).toContainEqual({ field: 'page', value: '/posts/hello', label: '/posts/hello' })
      expect(filters).toContainEqual({ field: 'author', value: '42', label: '42' })
    })

    it('parses a text filter with default contains operator', () => {
      const params = new URLSearchParams({ q: 'hello' })
      const filters = parseCommentFiltersFromSearchParams(params)
      expect(filters).toHaveLength(1)
      expect(filters[0]).toMatchObject({ field: 'text', value: JSON.stringify({ value: 'hello', op: 'contains' }) })
    })

    it('parses a text filter with an explicit operator', () => {
      const params = new URLSearchParams({ q: 'hello', match: 'does-not-contain' })
      const filters = parseCommentFiltersFromSearchParams(params)
      expect(filters[0]).toMatchObject({
        field: 'text',
        value: JSON.stringify({ value: 'hello', op: 'does-not-contain' }),
      })
    })

    it('parses a date filter with explicit operator', () => {
      const params = new URLSearchParams({ date: '2024-01-01', dateOp: 'is-greater' })
      const filters = parseCommentFiltersFromSearchParams(params)
      expect(filters[0]).toMatchObject({
        field: 'date',
        value: JSON.stringify({ date: '2024-01-01', op: 'is-greater' }),
      })
    })

    it('falls back to default date operator when dateOp is missing', () => {
      const params = new URLSearchParams({ date: '2024-01-01' })
      const filters = parseCommentFiltersFromSearchParams(params)
      expect(filters[0]).toMatchObject({ field: 'date' })
      expect(JSON.parse(filters[0]!.value)).toHaveProperty('op')
    })

    it('falls back to default date operator when dateOp is invalid', () => {
      const params = new URLSearchParams({ date: '2024-01-01', dateOp: 'invalid' })
      const filters = parseCommentFiltersFromSearchParams(params)
      expect(filters[0]).toMatchObject({ field: 'date' })
      expect(JSON.parse(filters[0]!.value)).toHaveProperty('op')
    })
  })
})
