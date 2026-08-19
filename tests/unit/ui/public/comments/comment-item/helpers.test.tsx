import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  asKey,
  childrenListClass,
  commentAuthorClass,
  commentAvatarClass,
  commentBodyClass,
  commentContentClass,
  commentFooterButtonClass,
  commentInnerClass,
  editableHint,
  nestedCommentInnerClass,
  nestedCommentLiClass,
  rootCommentLiClass,
} from '@/ui/public/comments/comment-item/helpers'

describe('ui/public/comments/comment-item/helpers', () => {
  describe('asKey', () => {
    it('stringifies bigint values', () => {
      expect(asKey(42)).toBe('42')
    })

    it('stringifies numbers', () => {
      expect(asKey(7)).toBe('7')
    })

    it('returns strings unchanged', () => {
      expect(asKey('abc')).toBe('abc')
    })
  })

  describe('class helpers', () => {
    it('produces non-empty class strings', () => {
      expect(childrenListClass).toContain('mt-5')
      expect(childrenListClass).toContain('bg-surface')
      expect(commentBodyClass).toContain('comment-body')
      expect(commentAuthorClass).toContain('font-bold')
      expect(commentInnerClass).toContain('min-w-0')
      expect(commentFooterButtonClass).toContain('bg-transparent')
    })

    it('rootCommentLiClass includes bottom border and last-child resets', () => {
      const cls = rootCommentLiClass()
      expect(cls).toContain('border-b')
      expect(cls).toContain('last:border-b-0')
    })

    it('nestedCommentLiClass removes bottom border', () => {
      const cls = nestedCommentLiClass()
      expect(cls).toContain('border-b-0')
    })

    it('nestedCommentInnerClass adds top margin', () => {
      const cls = nestedCommentInnerClass()
      expect(cls).toContain('mt-1')
    })

    it('commentAvatarClass scales by depth', () => {
      const depth1 = commentAvatarClass(1)
      const depth2 = commentAvatarClass(2)
      expect(depth1).toContain('size-10')
      expect(depth2).toContain('size-[30px]')
    })

    it('commentContentClass adjusts spacing by depth', () => {
      const depth1 = commentContentClass(1)
      const depth2 = commentContentClass(2)
      expect(depth1).toContain('my-2')
      expect(depth2).toContain('my-1.5')
    })
  })

  describe('editableHint', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns the pending hint when no expiry and pending', () => {
      expect(editableHint(undefined, true)).toBe('此消息正在等待审核，可编辑。')
    })

    it('returns the editable hint when no expiry and not pending', () => {
      expect(editableHint(undefined, false)).toBe('可编辑此消息。')
    })

    it('shows expired pending hint', () => {
      expect(editableHint(Date.now() - 1000, true)).toBe('此消息正在等待审核，编辑时间已过期。')
    })

    it('shows expired non-pending hint', () => {
      expect(editableHint(Date.now() - 1000, false)).toBe('编辑时间已过期。')
    })

    it('shows seconds remaining when under a minute', () => {
      const expiresAt = Date.now() + 30_000
      expect(editableHint(expiresAt, false)).toBe('30 秒内可编辑此消息。')
    })

    it('shows minutes remaining', () => {
      const expiresAt = Date.now() + 5 * 60 * 1000
      expect(editableHint(expiresAt, true)).toBe('此消息正在等待审核，5 分钟内可编辑。')
    })

    it('shows hours and minutes remaining when >= 60 minutes', () => {
      const expiresAt = Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000
      expect(editableHint(expiresAt, false)).toBe('2 小时 30 分钟内可编辑此消息。')
    })

    it('shows only hours when the remaining minutes are a whole hour', () => {
      const expiresAt = Date.now() + 3 * 60 * 60 * 1000
      expect(editableHint(expiresAt, false)).toBe('3 小时内可编辑此消息。')
    })
  })
})
