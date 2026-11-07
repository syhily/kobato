// The single aggregation of every message catalog, plus the ICU contract the
// catalogs are held to. Server-only value import surface: `messages/ui/**` and
// `messages/server/**` reach the client exclusively through the root loader,
// never through this module's static graph.
//
// Validation compares VARIABLES and LOGICAL OPTIONS, not plural categories:
// English may need one/other where Chinese only needs other. The rules are
//   · every argument name (including rich-text tag names) matches the English
//     baseline, and so does its kind (plain / plural / select / number …);
//   · every plural/select carries `other` (the ICU parser itself rejects a
//     message without it: MISSING_OTHER_CLAUSE), and every plural category it
//     uses is legal for that locale's `Intl.PluralRules`;
//   · every select covers the baseline's option values.
// A violation throws {@link CatalogValidationError}; `shared/` has no logger,
// so the root-loader / server-translator boundaries catch, log, and degrade.

import { TYPE, parse, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

import type { AppLocale } from '@/shared/i18n/locales'
import type { ServerMessages } from '@/shared/i18n/messages/server/en-US'
import type { UiMessages } from '@/shared/i18n/messages/ui/en-US'

import { BASE_LOCALE, SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { serverMessagesEnUS } from '@/shared/i18n/messages/server/en-US'
import { serverMessagesZhCN } from '@/shared/i18n/messages/server/zh-CN'
import { serverMessagesZhHK } from '@/shared/i18n/messages/server/zh-HK'
import { serverMessagesZhTW } from '@/shared/i18n/messages/server/zh-TW'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@/shared/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@/shared/i18n/messages/ui/zh-TW'

export type CatalogNamespace = 'ui' | 'server'

/** The two catalogs a locale resolves to. `ui` ships to the client; `server` never leaves the server. */
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

/**
 * The locale's UI catalog merged over the English baseline. The type already
 * proves completeness; the merge is the runtime safety net for a catalog
 * patched outside the type system.
 */
export function uiMessagesFor(locale: AppLocale): UiMessages {
  if (locale === BASE_LOCALE) {
    return uiMessagesEnUS
  }
  return { ...uiMessagesEnUS, ...UI_CATALOGS[locale] }
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
  /** Present for select / plural arguments: the option keys the message handles. */
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
    // `=0`-style exact matches are legal in every locale; categories are not.
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

/** One namespace's baseline + the four localized catalogs to check against it. */
export interface MessageCatalogSource {
  namespace: CatalogNamespace
  base: Record<string, string>
  catalogs: Record<AppLocale, Record<string, string>>
}

/**
 * Every violation in one namespace. Exported so the rule set is testable with
 * synthetic catalogs — the shipped catalogs must be clean, so their failure
 * modes can only be pinned this way.
 */
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

/** Every catalog violation across both namespaces and all four locales. */
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
