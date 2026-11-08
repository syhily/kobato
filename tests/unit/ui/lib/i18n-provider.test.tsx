// @vitest-environment happy-dom
/**
 * `localizeMessage` is the seam that turns a possibly-catalog-valued string
 * (Zod issue messages, domain descriptors) into display copy. It must use the
 * one ICU engine (react-intl) and never leak a diagnostic: no token names, no
 * raw ICU template, no message id.
 *
 * A missing param or an unformattable message logs and degrades to a generic
 * localized validation sentence. Custom issue params (`ctx.addIssue({ params })`)
 * are the real fix for `{label}`-style messages — they arrive through
 * `zodIssueParams` in `useSettingsCard`.
 */

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UiMessages } from '@/shared/i18n/messages/ui/en-US'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { useI18n } from '@/ui/lib/I18nProvider'

const logWarn = vi.hoisted(() => vi.fn())

vi.mock('@/client/lib/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: logWarn,
    error: vi.fn(),
    child: vi.fn(),
    withScope: vi.fn(),
  }),
}))

/** The real zh-CN catalog plus the probe messages the assertions need. */
const MESSAGES = {
  ...uiMessagesZhCN,
  'test.flag': '状态：{enabled}',
  'test.two': '「{label}」限制为 {max} 字节',
  'test.plural': '{count, plural, one {# 项} other {# 项}}',
} as unknown as UiMessages

const FALLBACK = uiMessagesZhCN['error.api.badRequest']

function localize(
  value: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  messages: UiMessages = MESSAGES,
) {
  let result = ''
  function Probe() {
    const { localizeMessage } = useI18n()
    result = localizeMessage(value, params)
    return null
  }
  render(wrapWithI18n(<Probe />, { messages }))
  return result
}

/** No raw ICU template and no raw message id may survive. */
function expectNoTemplate(text: string, id: string) {
  expect(text).not.toContain('{')
  expect(text).not.toContain('}')
  expect(text).not.toBe(id)
}

function warnedAboutFallback(): boolean {
  return logWarn.mock.calls.some(([message]) => String(message).includes('localizeMessage'))
}

beforeEach(() => {
  logWarn.mockReset()
})

describe('localizeMessage — custom Zod issue params', () => {
  it('interpolates a custom `params` bag (the S3 field label)', () => {
    expect(localize('admin.settings.assets.error.s3FieldRequired', { label: 'Bucket' })).toBe(
      '开启 S3 上传时「Bucket」必填',
    )
  })

  it('stringifies boolean scalars (the wire allows them; ICU cannot format them)', () => {
    expect(localize('test.flag', { enabled: true })).toBe('状态：true')
  })

  it('passes null through — the wire contract means an explicit empty value', () => {
    expect(localize('test.flag', { enabled: null })).toBe('状态：')
    expect(warnedAboutFallback()).toBe(false)
  })

  it('keeps the numeric bounds a too_small / too_big issue carries', () => {
    expect(localize('test.two', { label: '标题', max: 120 })).toBe('「标题」限制为 120 字节')
  })

  it('still routes ICU plural messages through the formatter', () => {
    expect(localize('test.plural', { count: 2 })).toBe('2 项')
  })
})

describe('localizeMessage — missing params and format errors', () => {
  it('falls back to a generic localized sentence when one param is missing', () => {
    const text = localize('test.two', { max: 120 })
    expectNoTemplate(text, 'test.two')
    expect(text).toBe(FALLBACK)
    expect(warnedAboutFallback()).toBe(true)
  })

  it('falls back when the caller has no params at all', () => {
    const text = localize('test.two')
    expectNoTemplate(text, 'test.two')
    expect(text).toBe(FALLBACK)
    expect(warnedAboutFallback()).toBe(true)
  })

  it('does not degrade a plural to token names when its count is missing', () => {
    const text = localize('test.plural')
    expectNoTemplate(text, 'test.plural')
    expect(text).toBe(FALLBACK)
    expect(warnedAboutFallback()).toBe(true)
  })

  it('uses an English fallback when even the generic catalog entry is absent', () => {
    const text = localize('test.two', { max: 120 }, {
      'test.two': '「{label}」限制为 {max} 字节',
    } as unknown as UiMessages)
    expectNoTemplate(text, 'test.two')
    expect(text).toBe('Invalid input')
  })
})

describe('localizeMessage — passthrough', () => {
  it('leaves non-catalog prose untouched (Zod default messages)', () => {
    expect(localize('Too small: expected string to have >=1 characters')).toBe(
      'Too small: expected string to have >=1 characters',
    )
  })

  it('leaves an unknown id untouched', () => {
    expect(localize('not.a.catalog.id', { label: 'x' })).toBe('not.a.catalog.id')
  })
})
