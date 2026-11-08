import { describe, expect, it } from 'vitest'

import { zodIssueParams } from '@/shared/utils/zod-issue-bounds'

// The ONE issue-params extractor shared by the client form hook and the server
// wire mapper: numeric bounds (`too_small`/`too_big`) merged with a custom
// issue's explicit `params` bag, primitives only.

describe('zodIssueParams', () => {
  it('merges numeric bounds with custom primitive params', () => {
    expect(
      zodIssueParams({
        code: 'custom',
        minimum: 60,
        params: {
          label: 'Bucket',
          enabled: true,
          nullable: null,
          count: 2,
          nested: { ignored: true },
          list: [1, 2],
          skipped: undefined,
        },
      }),
    ).toEqual({ min: 60, label: 'Bucket', enabled: true, nullable: null, count: 2 })
  })

  it('lets an explicit custom param win over a bound of the same name', () => {
    expect(zodIssueParams({ minimum: 5, params: { min: 9 } })).toEqual({ min: 9 })
  })

  it('returns bounds alone, params alone, or undefined', () => {
    expect(zodIssueParams({ maximum: 10 })).toEqual({ max: 10 })
    expect(zodIssueParams({ params: { label: 'x' } })).toEqual({ label: 'x' })
    expect(zodIssueParams({ code: 'custom' })).toBeUndefined()
    expect(zodIssueParams({ params: { nested: {}, list: [] } })).toBeUndefined()
  })

  it('ignores non-numeric / non-finite bounds and non-object issues', () => {
    expect(zodIssueParams({ minimum: Number.POSITIVE_INFINITY })).toBeUndefined()
    expect(zodIssueParams({ minimum: '5' })).toBeUndefined()
    expect(zodIssueParams(null)).toBeUndefined()
    expect(zodIssueParams('issue')).toBeUndefined()
  })
})
