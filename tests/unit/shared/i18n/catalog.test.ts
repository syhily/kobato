import { describe, expect, it } from 'vitest'

import {
  CatalogValidationError,
  assertCatalogsValid,
  collectCatalogIssues,
  collectMessageCatalogIssues,
  messageCatalogsFor,
  serverMessagesFor,
  uiMessagesFor,
  type MessageCatalogSource,
} from '@/shared/i18n/catalog'
import { SUPPORTED_LOCALES, type AppLocale } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'

/** Per-locale overrides; `null` removes the key so "missing key" stays testable. */
type Overrides = Partial<Record<AppLocale, Record<string, string | null>>>

/** Synthetic source: every locale starts from the base message, then applies its overrides. */
function source(base: Record<string, string>, overrides: Overrides = {}) {
  const catalogs = {} as Record<AppLocale, Record<string, string>>
  for (const locale of SUPPORTED_LOCALES) {
    const messages: Record<string, string> = { ...base }
    for (const [key, value] of Object.entries(overrides[locale] ?? {})) {
      if (value === null) {
        delete messages[key]
      } else {
        messages[key] = value
      }
    }
    catalogs[locale] = messages
  }
  return { namespace: 'ui', base, catalogs } satisfies MessageCatalogSource
}

function reasons(input: MessageCatalogSource): string[] {
  return collectMessageCatalogIssues(input).map((issue) => `${issue.locale}:${issue.key}: ${issue.reason}`)
}

const ENGLISH_PLURAL = '{count, plural, one {# item} other {# items}}'
const ZH_PLURAL_ONLY_OTHER = '{count, plural, other {# 项}}'
const ZH_TW_PLURAL_ONLY_OTHER = '{count, plural, other {# 項}}'

/** English one/other, every Chinese locale other-only — the shape the catalogs ship. */
function pluralSource(): MessageCatalogSource {
  return source(
    { items: ENGLISH_PLURAL },
    {
      'zh-CN': { items: ZH_PLURAL_ONLY_OTHER },
      'zh-HK': { items: ZH_TW_PLURAL_ONLY_OTHER },
      'zh-TW': { items: ZH_TW_PLURAL_ONLY_OTHER },
    },
  )
}

describe('shared/i18n/catalog', () => {
  it('ships four locales with no ICU or key violations', () => {
    expect(collectCatalogIssues()).toEqual([])
    expect(() => assertCatalogsValid()).not.toThrow()
  })

  it('merges the English baseline under each localized UI catalog', () => {
    expect(uiMessagesFor('en-US')).toBe(uiMessagesEnUS)
    // Both namespaces stay separate: server-only keys never enter the UI catalog.
    expect(Object.hasOwn(uiMessagesFor('zh-CN'), 'email.common.greeting')).toBe(false)
    expect(uiMessagesFor('zh-TW')['common.action.reload']).toBe('重新整理')
    expect(serverMessagesFor('zh-CN')['email.common.greeting']).toBe('你好，{receiver}')
  })

  it('resolves a locale to both catalogs', () => {
    const catalogs = messageCatalogsFor('zh-HK')

    expect(catalogs.locale).toBe('zh-HK')
    expect(catalogs.ui['common.action.reload']).toBe('重新載入')
    expect(catalogs.server['email.common.greeting']).toBe('你好，{receiver}')
  })

  it('accepts plural category differences the locale legitimately has', () => {
    // English needs one/other; Chinese only other. Same variable, different categories.
    expect(reasons(pluralSource())).toEqual([])
  })

  it('rejects a plural category the locale does not have', () => {
    const input = pluralSource()
    input.catalogs['zh-HK'] = { items: '{count, plural, one {# 項} other {# 項}}' }
    const issues = reasons(input)

    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('zh-HK:items')
    expect(issues[0]).toContain('one')
  })

  it('rejects a plural without an other branch (the ICU parser enforces it)', () => {
    const input = pluralSource()
    input.catalogs['zh-TW'] = { items: '{count, plural, =0 {沒有}}' }
    const issues = reasons(input)

    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('zh-TW:items')
    expect(issues[0]).toContain('MISSING_OTHER_CLAUSE')
  })

  it('rejects dropped, renamed and extra arguments', () => {
    expect(reasons(source({ msg: 'At most {max} characters.' }, { 'zh-CN': { msg: '最多字符。' } }))[0]).toContain(
      'missing argument `{max}`',
    )
    expect(
      reasons(source({ msg: 'At most {max} characters.' }, { 'zh-CN': { msg: '最多 {limit} 个字符。' } })),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing argument `{max}`'),
        expect.stringContaining('extra argument `{limit}`'),
      ]),
    )
    expect(reasons(source({ msg: 'Hello {name}.' }, { 'zh-CN': { msg: '你好 {name}{extra}。' } }))[0]).toContain(
      'extra argument `{extra}`',
    )
  })

  it('rejects a variable used with a different ICU kind', () => {
    const issues = reasons(source({ msg: '{count, plural, other {# items}}' }, { 'zh-CN': { msg: '{count} 项' } }))

    expect(issues[0]).toContain('plural')
    expect(issues[0]).toContain('plain')
  })

  it('rejects a select that does not cover the baseline options', () => {
    const base = { msg: '{kind, select, post {Post} page {Page} other {Other}}' }
    expect(reasons(source(base, { 'zh-CN': { msg: '{kind, select, post {文章} page {页面} other {其他}}' } }))).toEqual(
      [],
    )
    expect(reasons(source(base, { 'zh-CN': { msg: '{kind, select, post {文章} other {其他}}' } }))[0]).toContain(
      'select `{kind}` does not cover page',
    )
  })

  it('rejects missing keys, stray keys and unparseable ICU', () => {
    const issues = reasons(source({ a: 'A' }, { 'zh-CN': { a: null, b: 'B' }, 'zh-HK': { a: '{oops' } }))

    expect(issues.some((issue) => issue.includes('missing key'))).toBe(true)
    expect(issues.some((issue) => issue.includes('not in the English baseline'))).toBe(true)
    expect(issues.some((issue) => issue.includes('unparseable ICU'))).toBe(true)
  })

  it('throws a CatalogValidationError that carries every issue', () => {
    const error = new CatalogValidationError([
      { namespace: 'ui', locale: 'zh-CN', key: 'a', reason: 'missing key' },
      { namespace: 'server', locale: 'zh-TW', key: 'b', reason: 'unparseable ICU' },
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('CatalogValidationError')
    expect(error.message).toContain('2 issues')
    expect(error.issues).toHaveLength(2)
  })
})
