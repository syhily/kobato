import { describe, expect, it } from 'vitest'

import type { MessageId } from '@/server/infra/i18n'

import { createServerTranslator } from '@/server/infra/i18n'

describe('server/infra/i18n', () => {
  it('formats UI messages in every locale', () => {
    expect(createServerTranslator('en-US').format('common.action.save')).toBe('Save')
    expect(createServerTranslator('zh-CN').format('common.action.save')).toBe('保存')
    expect(createServerTranslator('zh-HK').format('common.action.reload')).toBe('重新載入')
    expect(createServerTranslator('zh-TW').format('common.action.reload')).toBe('重新整理')
  })

  it('formats server-only messages, which the UI catalog does not carry', () => {
    expect(createServerTranslator('en-US').format('email.common.greeting', { receiver: 'Ada' })).toBe('Hello Ada,')
    expect(createServerTranslator('zh-CN').format('email.common.greeting', { receiver: '雨帆' })).toBe('你好，雨帆')
    expect(
      createServerTranslator('zh-TW').format('email.common.copyright', { siteTitle: '且听书吟', year: 2026 }),
    ).toBe('且听书吟 © 2026')
  })

  it('applies ICU interpolation', () => {
    expect(createServerTranslator('en-US').format('validation.form.maxLength', { max: 40 })).toBe(
      'At most 40 characters.',
    )
    expect(createServerTranslator('zh-HK').format('validation.form.minLength', { min: 2 })).toBe('至少 2 個字元。')
  })

  it('applies each locale’s own plural rules', () => {
    expect(createServerTranslator('en-US').format('common.count.items', { count: 1 })).toBe('1 item')
    expect(createServerTranslator('en-US').format('common.count.items', { count: 7 })).toBe('7 items')
    expect(createServerTranslator('zh-CN').format('common.count.items', { count: 7 })).toBe('7 项')
    expect(createServerTranslator('zh-TW').format('common.count.items', { count: 7 })).toBe('7 項')
  })

  it('caches one translator per locale', () => {
    expect(createServerTranslator('zh-CN')).toBe(createServerTranslator('zh-CN'))
    expect(createServerTranslator('zh-CN')).not.toBe(createServerTranslator('en-US'))
    expect(createServerTranslator('zh-CN').locale).toBe('zh-CN')
  })

  it('fails loudly on an unregistered id outside production', () => {
    // @ts-expect-error — dynamic legacy ids are exactly what this guard catches.
    expect(() => createServerTranslator('zh-CN').format('common.action.notRegistered')).toThrow(
      'Unknown i18n message id: common.action.notRegistered',
    )
    const id = 'ui.common.missing' as MessageId
    expect(() => createServerTranslator('zh-CN').format(id)).toThrow('Unknown i18n message id')
  })
})
