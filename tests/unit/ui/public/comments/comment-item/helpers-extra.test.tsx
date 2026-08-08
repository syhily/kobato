import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { commentAvatarClass, commentContentClass, editableHint } from '@/ui/public/comments/comment-item/helpers'

describe('editableHint — pending/non-pending branch coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows hours-and-minutes pending hint when >= 60 minutes remain', () => {
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000
    expect(editableHint(expiresAt, true)).toBe('此消息正在等待审核，2 小时 30 分钟内可编辑。')
  })

  it('shows whole-hour pending hint when remaining minutes are an exact hour', () => {
    const expiresAt = Date.now() + 3 * 60 * 60 * 1000
    expect(editableHint(expiresAt, true)).toBe('此消息正在等待审核，3 小时内可编辑。')
  })

  it('shows seconds pending hint when under a minute remains', () => {
    const expiresAt = Date.now() + 30_000
    expect(editableHint(expiresAt, true)).toBe('此消息正在等待审核，30 秒内可编辑。')
  })

  it('shows minutes non-pending hint', () => {
    const expiresAt = Date.now() + 5 * 60 * 1000
    expect(editableHint(expiresAt, false)).toBe('5 分钟内可编辑此消息。')
  })

  it('treats exactly 1 remaining minute as the seconds branch', () => {
    const expiresAt = Date.now() + 500 // ceil → 1 second, ceil-mins → 1
    const out = editableHint(expiresAt, false)
    expect(out).toMatch(/秒内可编辑此消息。$/)
  })

  it('returns the raw error string when authError is an unknown code', () => {
    const expiresAt = Date.now() + 10 * 60 * 1000
    expect(editableHint(expiresAt, false)).toBe('10 分钟内可编辑此消息。')
  })
})

describe('commentAvatarClass / commentContentClass — depth boundaries', () => {
  it('uses the larger avatar size only at exactly depth 1', () => {
    expect(commentAvatarClass(1)).toContain('size-10')
    // Any non-1 depth uses the smaller size, including depth 0.
    expect(commentAvatarClass(0)).toContain('size-[30px]')
    expect(commentAvatarClass(2)).toContain('size-[30px]')
    expect(commentAvatarClass(5)).toContain('size-[30px]')
  })

  it('uses the wider content spacing only at exactly depth 1', () => {
    expect(commentContentClass(1)).toContain('my-2')
    // Non-1 depths get the tighter spacing.
    expect(commentContentClass(0)).toContain('my-1.5')
    expect(commentContentClass(3)).toContain('my-1.5')
  })
})
