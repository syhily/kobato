import { describe, expect, it } from 'vitest'

import { formatBytes, formatLocalDate, formatShowDate, slicePosts } from '@/shared/utils/formatter'

const SETTINGS = {
  settings: { locale: 'zh-CN', timeZone: 'Asia/Shanghai', timeFormat: 'yyyy-LL-dd HH:mm' },
}

// --- formatBytes ----------------------------------------------------------

describe('shared/utils/formatter — formatBytes', () => {
  it('renders bytes below 1 KiB as B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('renders bytes below 1 MiB as KB with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('renders bytes below 1 GiB as MB with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })

  it('renders bytes of 1 GiB and above as GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB')
  })
})

// --- slicePosts (extra branches) -----------------------------------------

describe('shared/utils/formatter — slicePosts mergeTailWhenLessThan', () => {
  it('returns the natural last page tail when threshold is 0', () => {
    const result = slicePosts(
      Array.from({ length: 12 }, (_, i) => i),
      2,
      10,
      {
        mergeTailWhenLessThan: 0,
      },
    )
    expect(result.totalPage).toBe(2)
    expect(result.currentPosts).toEqual([10, 11])
  })

  it('merges the last page into the previous one when the tail is below the threshold', () => {
    // 12 posts, pageSize 10 → natural last page has 2 posts. Threshold 3
    // means 2 < 3, so the tail merges into page 1.
    const result = slicePosts(
      Array.from({ length: 12 }, (_, i) => i),
      1,
      10,
      {
        mergeTailWhenLessThan: 3,
      },
    )
    expect(result.totalPage).toBe(1)
    expect(result.currentPosts).toHaveLength(12)
  })

  it('keeps the natural totalPage when the tail meets the threshold', () => {
    // 13 posts, pageSize 10 → tail of 3; threshold 3 keeps the split.
    const result = slicePosts(
      Array.from({ length: 13 }, (_, i) => i),
      1,
      10,
      {
        mergeTailWhenLessThan: 3,
      },
    )
    expect(result.totalPage).toBe(2)
  })

  it('does not merge when there is only a single natural page', () => {
    const result = slicePosts(
      Array.from({ length: 5 }, (_, i) => i),
      1,
      10,
      {
        mergeTailWhenLessThan: 10,
      },
    )
    expect(result.totalPage).toBe(1)
    expect(result.currentPosts).toHaveLength(5)
  })

  it('threshold is ignored when totalPage would dip below 1', () => {
    // Empty list → naturalTotalPage 0; merge never applies.
    const result = slicePosts([], 1, 10, { mergeTailWhenLessThan: 10 })
    expect(result.totalPage).toBe(0)
    expect(result.currentPosts).toEqual([])
  })
})

// --- formatShowDate (far-past branch) ------------------------------------

describe('shared/utils/formatter — formatShowDate far-past branch', () => {
  it('falls through to formatLocalDate when the delta is >= 210 days', () => {
    const past = new Date('2020-01-01T00:00:00Z')
    const now = new Date('2024-01-01T00:00:00Z') // ~1461 days later
    const out = formatShowDate(past, SETTINGS, now)
    // Falls back to the configured timeFormat template.
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('uses "今天" when the date is the same day as now', () => {
    const now = new Date('2024-06-15T12:00:00+08:00')
    const same = new Date('2024-06-15T01:00:00+08:00')
    expect(formatShowDate(same, SETTINGS, now)).toBe('今天')
  })
})

// --- formatLocalDate (direct, multiple format tokens) --------------------

describe('shared/utils/formatter — formatLocalDate token substitution', () => {
  it('substitutes every supported token', () => {
    const iso = '2024-03-05T06:07:08Z'
    // Asia/Shanghai is UTC+8 → 14:07:08 local. We assert each token appears.
    const out = formatLocalDate(iso, 'yyyy-LL-MM-dd HH:mm:ss', SETTINGS)
    // Two substitutions both produce the month ("03"), so MM and LL match.
    expect(out).toBe('2024-03-03-05 14:07:08')
  })

  it('uses the configured timeFormat when no explicit format is passed', () => {
    const out = formatLocalDate('2024-03-05T06:07:08Z', undefined, SETTINGS)
    expect(out).toBe('2024-03-05 14:07')
  })
})
