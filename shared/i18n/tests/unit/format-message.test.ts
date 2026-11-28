import { uiMessagesFor } from '@kobato/i18n/catalog'
import { formatUiMessage } from '@kobato/i18n/format-message'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { createIntl, createIntlCache } from 'react-intl'
import { describe, expect, it } from 'vitest'

const cache = createIntlCache()

function reactIntlFormat(locale: 'en-US' | 'zh-CN', id: string, values?: Record<string, string | number>): string {
  const messages = locale === 'en-US' ? uiMessagesFor('en-US') : { ...uiMessagesFor('en-US'), ...uiMessagesZhCN }
  const intl = createIntl({ locale, messages, onError: () => undefined }, cache)
  return intl.formatMessage({ id }, values)
}

describe('formatUiMessage', () => {
  it('matches react-intl formatting for real catalog keys, the authFlowMessage path', () => {
    const locale = 'zh-CN'
    const messages: Record<string, string> = { ...uiMessagesFor(locale) }
    expect(formatUiMessage(locale, messages, 'error.api.forbidden')).toBe(
      reactIntlFormat(locale, 'error.api.forbidden'),
    )
    expect(formatUiMessage(locale, messages, 'meta.listing.page', { page: 3 })).toBe(
      reactIntlFormat(locale, 'meta.listing.page', { page: 3 }),
    )
    expect(formatUiMessage(locale, messages, 'meta.listing.titleWithPage', { title: '随笔', page: 2 })).toBe(
      reactIntlFormat(locale, 'meta.listing.titleWithPage', { title: '随笔', page: 2 }),
    )
    expect(formatUiMessage(locale, messages, 'common.count.items', { count: 5 })).toBe(
      reactIntlFormat(locale, 'common.count.items', { count: 5 }),
    )
    expect(
      formatUiMessage('en-US', uiMessagesFor('en-US'), 'public.chrome.copyright', { start: 2020, end: 2026 }),
    ).toBe(reactIntlFormat('en-US', 'public.chrome.copyright', { start: 2020, end: 2026 }))
  })

  it('drops boolean, null and undefined values exactly like the rendered react-intl output does', () => {
    const locale = 'en-US'
    const messages: Record<string, string> = { 'error.api.badRequest': 'a={a} b={b} c={c}' }
    const values = { a: true, b: null, c: 'kept' }
    const reactIntlOutput: unknown = createIntl({ locale, messages, onError: () => undefined }, cache).formatMessage(
      { id: 'error.api.badRequest' },
      values,
    )
    const visible =
      typeof reactIntlOutput === 'string'
        ? reactIntlOutput
        : Array.isArray(reactIntlOutput)
          ? reactIntlOutput.filter((part): part is string => typeof part === 'string').join('')
          : ''
    expect(visible).toBe('a= b= c=kept')
    expect(formatUiMessage(locale, messages, 'error.api.badRequest', values)).toBe(visible)
  })

  it('falls back to the id itself when the catalog misses the key', () => {
    expect(formatUiMessage('en-US', {}, 'meta.section.page')).toBe('meta.section.page')
  })

  it('returns the raw catalog text when the formatter cannot render it', () => {
    expect(formatUiMessage('en-US', { 'meta.section.page': 'Hello {missing}' }, 'meta.section.page')).toBe(
      'Hello {missing}',
    )
  })

  it('reuses one intl instance per locale and swaps it when the message table changes', () => {
    const first: Record<string, string> = { 'meta.section.page': 'First' }
    const second: Record<string, string> = { 'meta.section.page': 'Second' }
    expect(formatUiMessage('en-US', first, 'meta.section.page')).toBe('First')
    expect(formatUiMessage('en-US', first, 'meta.section.page')).toBe('First')
    expect(formatUiMessage('en-US', second, 'meta.section.page')).toBe('Second')
  })
})
