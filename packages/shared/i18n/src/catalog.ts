// The single aggregation of every message catalog, plus the ICU contract the
// catalogs are held to. Server-only value import surface: `messages/ui/**` and
// `messages/server/**` reach the client exclusively through the root loader, never
// through this module's static graph.
//
// Validation compares VARIABLES and LOGICAL OPTIONS, not plural categories: English
// may need one/other where Chinese only needs other. Every argument name (including
// rich-text tag names) must match the English baseline, and so must its kind
// (plain / plural / select / number …); every plural/select must carry `other` (the
// ICU parser itself rejects a message without it: MISSING_OTHER_CLAUSE) and use only
// categories legal for that locale's `Intl.PluralRules`; every select must cover
// the baseline's option values. A violation throws {@link CatalogValidationError};
// `shared/` has no logger, so the root-loader / server-translator boundaries catch,
// log and degrade.
//
// Scope: `content.bootstrap` ships `uiMessagesForScope(locale, scope)` — the
// workspace catalog for /admin + /editor, and the `admin.*`-free public subset
// everywhere else (see `catalog-scope`). Every returned catalog is memoized per
// `locale:scope` and frozen, so callers share one object and cannot mutate it.

import type { CatalogScope } from '@kobato/i18n/catalog-scope'
import type { AppLocale } from '@kobato/i18n/locales'
import type { ServerMessages } from '@kobato/i18n/messages/server/en-US'
import type { UiMessages } from '@kobato/i18n/messages/ui/en-US'

import { TYPE, parse, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { isPublicMessageKey } from '@kobato/i18n/catalog-scope'
import { BASE_LOCALE, SUPPORTED_LOCALES } from '@kobato/i18n/locales'
import { serverMessagesEnUS } from '@kobato/i18n/messages/server/en-US'
import { serverMessagesZhCN } from '@kobato/i18n/messages/server/zh-CN'
import { serverMessagesZhHK } from '@kobato/i18n/messages/server/zh-HK'
import { serverMessagesZhTW } from '@kobato/i18n/messages/server/zh-TW'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@kobato/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW'

export type CatalogNamespace = 'ui' | 'server'

export interface MessageCatalogs {
  locale: AppLocale
  ui: UiMessages
  server: ServerMessages
}

const UI_CATALOGS = {
  'en-US': uiMessagesEnUS,
  'zh-HK': uiMessagesZhHK,
  'zh-TW': uiMessagesZhTW,
  'zh-CN': uiMessagesZhCN,
} as const satisfies Record<AppLocale, UiMessages>

const SERVER_CATALOGS = {
  'en-US': serverMessagesEnUS,
  'zh-HK': serverMessagesZhHK,
  'zh-TW': serverMessagesZhTW,
  'zh-CN': serverMessagesZhCN,
} as const satisfies Record<AppLocale, ServerMessages>

export type ScopedUiMessages = Readonly<Record<string, string>>

const SCOPE_CACHED_UI_CATALOGS = new Map<string, ScopedUiMessages>()

export function uiMessagesForScope(locale: AppLocale, scope: 'workspace'): UiMessages
export function uiMessagesForScope(locale: AppLocale, scope: CatalogScope): ScopedUiMessages
export function uiMessagesForScope(locale: AppLocale, scope: CatalogScope): ScopedUiMessages {
  const cacheKey = `${locale}:${scope}`
  const cached = SCOPE_CACHED_UI_CATALOGS.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }
  const full: Record<string, string> =
    locale === BASE_LOCALE ? uiMessagesEnUS : { ...uiMessagesEnUS, ...UI_CATALOGS[locale] }
  const value: Record<string, string> =
    scope === 'public' ? Object.fromEntries(Object.entries(full).filter(([key]) => isPublicMessageKey(key))) : full
  Object.freeze(value)
  SCOPE_CACHED_UI_CATALOGS.set(cacheKey, value)
  return value
}

export function uiMessagesFor(locale: AppLocale): UiMessages {
  return uiMessagesForScope(locale, 'workspace')
}

export function serverMessagesFor(locale: AppLocale): ServerMessages {
  if (locale === BASE_LOCALE) {
    return serverMessagesEnUS
  }
  return { ...serverMessagesEnUS, ...SERVER_CATALOGS[locale] }
}

export function messageCatalogsFor(locale: AppLocale): MessageCatalogs {
  return { locale, ui: uiMessagesFor(locale), server: serverMessagesFor(locale) }
}

export interface CatalogIssue {
  namespace: CatalogNamespace
  locale: AppLocale
  key: string
  reason: string
}

export class CatalogValidationError extends Error {
  readonly issues: readonly CatalogIssue[]

  constructor(issues: readonly CatalogIssue[]) {
    super(`i18n catalogs are invalid (${issues.length} issue${issues.length === 1 ? '' : 's'})`)
    this.name = 'CatalogValidationError'
    this.issues = issues
  }
}

type ArgumentKind = 'plain' | 'number' | 'date' | 'time' | 'plural' | 'selectordinal' | 'select' | 'tag'

interface ArgumentShape {
  kind: ArgumentKind
  options: string[]
}

interface MessageShape {
  args: Map<string, ArgumentShape>
}

function describeMessage(message: string): MessageShape {
  const args = new Map<string, ArgumentShape>()
  const visit = (elements: MessageFormatElement[]): void => {
    for (const element of elements) {
      switch (element.type) {
        case TYPE.argument:
          args.set(element.value, { kind: 'plain', options: [] })
          break
        case TYPE.number:
          args.set(element.value, { kind: 'number', options: [] })
          break
        case TYPE.date:
          args.set(element.value, { kind: 'date', options: [] })
          break
        case TYPE.time:
          args.set(element.value, { kind: 'time', options: [] })
          break
        case TYPE.tag:
          args.set(element.value, { kind: 'tag', options: [] })
          visit(element.children)
          break
        case TYPE.select: {
          args.set(element.value, { kind: 'select', options: Object.keys(element.options) })
          for (const option of Object.values(element.options)) {
            visit(option.value)
          }
          break
        }
        case TYPE.plural: {
          const kind: ArgumentKind = element.pluralType === 'ordinal' ? 'selectordinal' : 'plural'
          args.set(element.value, { kind, options: Object.keys(element.options) })
          for (const option of Object.values(element.options)) {
            visit(option.value)
          }
          break
        }
        case TYPE.literal:
        case TYPE.pound:
          break
      }
    }
  }
  visit(parse(message))
  return { args }
}

function allowedPluralCategories(locale: AppLocale, ordinal: boolean): string[] {
  const rules = new Intl.PluralRules(locale, ordinal ? { type: 'ordinal' } : { type: 'cardinal' })
  return [...rules.resolvedOptions().pluralCategories]
}

function compareShapes(
  key: string,
  namespace: CatalogNamespace,
  locale: AppLocale,
  base: MessageShape,
  target: MessageShape,
  issues: CatalogIssue[],
): void {
  const fail = (reason: string): void => {
    issues.push({ namespace, locale, key, reason })
  }

  for (const [name, baseArg] of base.args) {
    const targetArg = target.args.get(name)
    if (targetArg === undefined) {
      fail(`missing argument \`{${name}}\``)
      continue
    }
    if (targetArg.kind !== baseArg.kind) {
      fail(`argument \`{${name}}\` is ${targetArg.kind} but the baseline uses ${baseArg.kind}`)
      continue
    }
    if (baseArg.kind === 'select') {
      const missing = baseArg.options.filter((option) => !targetArg.options.includes(option))
      if (missing.length > 0) {
        fail(`select \`{${name}}\` does not cover ${missing.join(', ')}`)
      }
    }
  }

  for (const name of target.args.keys()) {
    if (!base.args.has(name)) {
      fail(`extra argument \`{${name}}\` is not in the baseline`)
    }
  }
}

function checkLocaleRules(
  key: string,
  namespace: CatalogNamespace,
  locale: AppLocale,
  shape: MessageShape,
  issues: CatalogIssue[],
): void {
  for (const [name, arg] of shape.args) {
    if (arg.kind !== 'plural' && arg.kind !== 'selectordinal') {
      continue
    }
    const allowed = allowedPluralCategories(locale, arg.kind === 'selectordinal')
    const invalid = arg.options.filter(
      (option) => option !== 'other' && !option.startsWith('=') && !allowed.includes(option),
    )
    if (invalid.length > 0) {
      issues.push({
        namespace,
        locale,
        key,
        reason: `plural \`{${name}}\` uses ${invalid.join(', ')} — ${locale} only has ${allowed.join(', ')}`,
      })
    }
  }
}

function parseShape(
  key: string,
  namespace: CatalogNamespace,
  locale: AppLocale,
  message: string,
  issues: CatalogIssue[],
): MessageShape | null {
  try {
    return describeMessage(message)
  } catch (error) {
    issues.push({
      namespace,
      locale,
      key,
      reason: `unparseable ICU: ${error instanceof Error ? error.message : String(error)}`,
    })
    return null
  }
}

export interface MessageCatalogSource {
  namespace: CatalogNamespace
  base: Record<string, string>
  catalogs: Record<AppLocale, Record<string, string>>
}

export function collectMessageCatalogIssues(source: MessageCatalogSource): CatalogIssue[] {
  const { namespace, base: baseMessages, catalogs } = source
  const issues: CatalogIssue[] = []
  const baseShapes = new Map<string, MessageShape>()

  for (const locale of SUPPORTED_LOCALES) {
    const messages = catalogs[locale]
    for (const key of Object.keys(baseMessages)) {
      if (!Object.hasOwn(messages, key)) {
        issues.push({ namespace, locale, key, reason: 'missing key' })
      }
    }
    for (const key of Object.keys(messages)) {
      if (!Object.hasOwn(baseMessages, key)) {
        issues.push({ namespace, locale, key, reason: 'key is not in the English baseline' })
        continue
      }
      const shape = parseShape(key, namespace, locale, messages[key], issues)
      if (shape === null) {
        continue
      }
      checkLocaleRules(key, namespace, locale, shape, issues)
      if (locale === BASE_LOCALE) {
        baseShapes.set(key, shape)
        continue
      }
      const baseShape = baseShapes.get(key)
      if (baseShape !== undefined) {
        compareShapes(key, namespace, locale, baseShape, shape, issues)
      }
    }
  }

  return issues
}

export function collectCatalogIssues(): CatalogIssue[] {
  return [
    ...collectMessageCatalogIssues({ namespace: 'ui', base: uiMessagesEnUS, catalogs: UI_CATALOGS }),
    ...collectMessageCatalogIssues({ namespace: 'server', base: serverMessagesEnUS, catalogs: SERVER_CATALOGS }),
  ]
}

export function assertCatalogsValid(): void {
  const issues = collectCatalogIssues()
  if (issues.length > 0) {
    throw new CatalogValidationError(issues)
  }
}
