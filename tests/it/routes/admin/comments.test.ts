import { describe, expect, it } from 'vitest'

import { parseCommentFiltersFromSearchParams } from '@/routes/admin/comments'

describe('parseCommentFiltersFromSearchParams — status / page / author', () => {
  it('returns an empty list for an empty search params', () => {
    expect(parseCommentFiltersFromSearchParams(new URLSearchParams())).toEqual([])
  })

  it('omits the status chip when `status` is `all`', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('status=all'))
    expect(filters).toEqual([])
  })

  it('maps `status=pending` to a Chinese-labelled status chip', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('status=pending'))
    expect(filters).toEqual([{ field: 'status', value: 'pending', label: '待审核' }])
  })

  it('falls back to 已审核 for any non-all status string (preserves the URL value verbatim)', () => {
    // The route can't enumerate every status — unknown statuses
    // by default. The controller will reject the bad value at the
    // Zod layer; this just means the chip stays visible until then.
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('status=approved'))
    expect(filters[0]).toEqual({ field: 'status', value: 'approved', label: '已审核' })
  })

  it('maps `pageKey` to a page chip', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('pageKey=pid-1'))
    expect(filters).toEqual([{ field: 'page', value: 'pid-1', label: 'pid-1' }])
  })

  it('maps `userId` to an author chip', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('userId=42'))
    expect(filters).toEqual([{ field: 'author', value: '42', label: '42' }])
  })
})

describe('parseCommentFiltersFromSearchParams — text', () => {
  it('parses a `q` URL param into a text chip with the default op', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('q=foo'))
    expect(filters).toHaveLength(1)
    const chip = filters[0]!
    expect(chip.field).toBe('text')
    const value = JSON.parse(chip.value) as { op: string; value: string }
    expect(value).toEqual({ op: 'contains', value: 'foo' })
    expect(chip.label).toBe('包含「foo」')
  })

  it('honors a valid `match` param', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('q=foo&match=does-not-contain'))
    const value = JSON.parse(filters[0]!.value) as { op: string; value: string }
    expect(value).toEqual({ op: 'does-not-contain', value: 'foo' })
    expect(filters[0]!.label).toBe('不包含「foo」')
  })

  it('falls back to `contains` for an unknown `match` value', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('q=foo&match=bogus'))
    const value = JSON.parse(filters[0]!.value) as { op: string; value: string }
    expect(value.op).toBe('contains')
  })

  it('truncates the label excerpt to 8 characters with an ellipsis', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('q=abcdefghijklmnop'))
    expect(filters[0]!.label).toBe('包含「abcdefgh…」')
  })
})

describe('parseCommentFiltersFromSearchParams — date', () => {
  it('parses a complete `date` + valid `dateOp` into a date chip', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('date=2026-06-01&dateOp=is-greater'))
    expect(filters).toHaveLength(1)
    const chip = filters[0]!
    expect(chip.field).toBe('date')
    const value = JSON.parse(chip.value) as { date: string; op: string }
    expect(value).toEqual({ date: '2026-06-01', op: 'is-greater' })
    expect(chip.label).toBe('之后 2026-06-01')
  })

  it('falls back to DEFAULT_DATE_OPERATOR (is-or-less) when only `date` is set', () => {
    // Regression: the previous fallback used `DATE_FILTER_OPERATORS[0]!.value`
    // which is `'is-less'` — the day-bound exclusive form. Ghost's
    // default and the picker's default is `'is-or-less'`, which
    // includes the day. A hand-typed URL like `?date=2026-06-01`
    // (no op) must round-trip to the same semantics the user
    // expects from the picker.
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('date=2026-06-01'))
    const value = JSON.parse(filters[0]!.value) as { date: string; op: string }
    expect(value.op).toBe('is-or-less')
    expect(value.date).toBe('2026-06-01')
    expect(filters[0]!.label).toBe('不晚于 2026-06-01')
  })

  it('falls back to DEFAULT_DATE_OPERATOR when `dateOp` is invalid', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('date=2026-06-01&dateOp=bogus'))
    const value = JSON.parse(filters[0]!.value) as { date: string; op: string }
    expect(value.op).toBe('is-or-less')
  })

  it('does not add a date chip when only `dateOp` is set (a chip without a date is meaningless)', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('dateOp=is-greater'))
    expect(filters).toEqual([])
  })

  it('does not add a date chip when only an invalid `dateOp` is set', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('dateOp=bogus'))
    expect(filters).toEqual([])
  })

  it('does not add a date chip when `date` is empty', () => {
    const filters = parseCommentFiltersFromSearchParams(new URLSearchParams('date=&dateOp=is-greater'))
    expect(filters).toEqual([])
  })
})

describe('parseCommentFiltersFromSearchParams — all five fields combined', () => {
  it('parses every field at once without dropping any', () => {
    const sp = new URLSearchParams(
      'status=pending' +
        '&pageKey=pid-1' +
        '&userId=42' +
        '&q=foo' +
        '&match=does-not-contain' +
        '&date=2026-06-01' +
        '&dateOp=is-greater',
    )
    const filters = parseCommentFiltersFromSearchParams(sp)
    expect(filters).toHaveLength(5)
    expect(filters.map((f) => f.field).sort()).toEqual(['author', 'date', 'page', 'status', 'text'].sort())
  })
})
