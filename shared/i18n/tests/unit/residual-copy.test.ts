import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@kobato/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW'
import { describe, expect, it } from 'vitest'

describe('UI catalog — regional Traditional comment wording', () => {
  it('uses 則留言 (not 条评论) for the admin comment count in zh-HK and zh-TW', () => {
    for (const [locale, messages] of [
      ['zh-HK', uiMessagesZhHK],
      ['zh-TW', uiMessagesZhTW],
    ] as const) {
      const value = messages['admin.my.comments.count']
      expect(value, locale).toContain('則留言')
      expect(value, locale).not.toContain('条')
      expect(value, locale).not.toContain('评论')
    }
  })

  it('keeps the simplified catalog on 条评论', () => {
    expect(uiMessagesZhCN['admin.my.comments.count']).toContain('条评论')
  })
})
