import { kobatoInklingLabelsEnUS } from '@kobato/i18n/inkling-labels/en-US'
import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhHK } from '@kobato/i18n/inkling-labels/zh-HK'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW'
import { BASE_LOCALE, type AppLocale } from '@kobato/i18n/locales'
import { serverMessagesEnUS } from '@kobato/i18n/messages/server/en-US'
import { serverMessagesZhCN } from '@kobato/i18n/messages/server/zh-CN'
import { serverMessagesZhHK } from '@kobato/i18n/messages/server/zh-HK'
import { serverMessagesZhTW } from '@kobato/i18n/messages/server/zh-TW'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@kobato/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW'
import { describe, expect, it } from 'vitest'

type MessageTable = Readonly<Record<string, string>>
type Catalogs = Readonly<Record<AppLocale, MessageTable>>
type LocalizedLocale = Exclude<AppLocale, 'en-US'>

const NAMESPACES: Readonly<Record<string, Catalogs>> = {
  inkling: {
    'en-US': kobatoInklingLabelsEnUS,
    'zh-CN': kobatoInklingLabelsZhCN,
    'zh-HK': kobatoInklingLabelsZhHK,
    'zh-TW': kobatoInklingLabelsZhTW,
  },
  server: {
    'en-US': serverMessagesEnUS,
    'zh-CN': serverMessagesZhCN,
    'zh-HK': serverMessagesZhHK,
    'zh-TW': serverMessagesZhTW,
  },
  ui: {
    'en-US': uiMessagesEnUS,
    'zh-CN': uiMessagesZhCN,
    'zh-HK': uiMessagesZhHK,
    'zh-TW': uiMessagesZhTW,
  },
}

const LOCALIZED: readonly LocalizedLocale[] = ['zh-CN', 'zh-HK', 'zh-TW']

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

// Brand names, protocols, identifiers, and input placeholders a Chinese catalog legitimately keeps byte-identical to
// the English baseline (`<namespace>:<key>`). Anything else identical to English is an untranslated copy — translate it.
const SHARED_WITH_ENGLISH: readonly string[] = [
  'inkling:menu.html.label',
  'inkling:settings.emoji',
  'server:email.common.copyright',
  'ui:admin.audit.filter.ip',
  'ui:admin.audit.idLabel',
  'ui:admin.audit.ipLabel',
  'ui:admin.audit.resource.webmention',
  'ui:admin.branding.slot.appleTouchIcon.label',
  'ui:admin.branding.slot.faviconIco.label',
  'ui:admin.branding.slot.faviconSvg.label',
  'ui:admin.branding.slot.icon192.label',
  'ui:admin.branding.slot.icon512.label',
  'ui:admin.categories.form.slug',
  'ui:admin.comments.editUser.badgePlaceholder',
  'ui:admin.editor.contentLanguage.placeholder',
  'ui:admin.editor.slugAria',
  'ui:admin.filter.date.value',
  'ui:admin.friends.form.homepagePlaceholder',
  'ui:admin.friends.form.rssPlaceholder',
  'ui:admin.images.detail.mime',
  'ui:admin.settings.analytics.geoip.file',
  'ui:admin.settings.assets.robots.title',
  'ui:admin.settings.comments.avatar.githubToken',
  'ui:admin.settings.comments.avatar.source.github',
  'ui:admin.settings.comments.avatar.source.gravatar',
  'ui:admin.settings.content.feed.title',
  'ui:admin.settings.mail.mailgun.apiKey',
  'ui:admin.settings.mail.mailgun.domainPlaceholder',
  'ui:admin.settings.mail.sender.placeholder',
  'ui:admin.settings.mail.smtp.hostPlaceholder',
  'ui:admin.settings.mail.smtp.userPlaceholder',
  'ui:admin.settings.mail.test.placeholder',
  'ui:admin.settings.observability.connection.endpointPlaceholder',
  'ui:admin.settings.section.webmentions.label',
  'ui:admin.settings.socials.network.github',
  'ui:admin.settings.socials.network.qq',
  'ui:admin.settings.socials.network.x',
  'ui:admin.settings.storage.domain.hostPlaceholder',
  'ui:admin.settings.storage.migration.dialog.regionPlaceholder',
  'ui:admin.settings.storage.s3.accessKey',
  'ui:admin.settings.storage.s3.bucket',
  'ui:admin.settings.storage.s3.endpoint',
  'ui:admin.settings.storage.s3.endpointPlaceholder',
  'ui:admin.settings.storage.s3.region',
  'ui:admin.settings.storage.s3.secret',
  'ui:admin.settings.storage.s3.urlTemplatePlaceholder',
  'ui:admin.shared.filter.datePlaceholder',
  'ui:admin.tags.form.slug',
  'ui:admin.tags.table.slug',
  'ui:admin.users.invite.emailPlaceholder',
  'ui:error.api.rawMessage',
  'ui:public.chrome.copyright',
]

const SHARED_WITH_ENGLISH_BY_LOCALE: Readonly<Record<LocalizedLocale, readonly string[]>> = {
  'zh-CN': [...SHARED_WITH_ENGLISH, 'ui:admin.settings.sidebar.quote.source.one'],
  'zh-HK': SHARED_WITH_ENGLISH,
  'zh-TW': SHARED_WITH_ENGLISH,
}

// The only English baseline values allowed to carry Chinese: illustrative defaults and brand names.
const HAN_IN_ENGLISH: readonly string[] = [
  'ui:admin.settings.content.footnotes.description',
  'ui:admin.settings.general.footer.icpPlaceholder',
  'ui:admin.settings.sidebar.quote.source.one',
]

function keysWhere(locale: AppLocale, predicate: (value: string | undefined, baseline: string) => boolean): string[] {
  const keys: string[] = []
  for (const [namespace, catalogs] of Object.entries(NAMESPACES)) {
    const baseline = catalogs[BASE_LOCALE]
    for (const key of Object.keys(baseline)) {
      if (predicate(catalogs[locale][key], baseline[key])) {
        keys.push(`${namespace}:${key}`)
      }
    }
  }
  return keys.sort()
}

describe('i18n catalogs — translation completeness', () => {
  it('has a non-blank translation for every key in every locale', () => {
    const blank = LOCALIZED.flatMap((locale) =>
      keysWhere(locale, (value) => typeof value !== 'string' || value.trim() === '').map((key) => `${locale} ${key}`),
    )
    expect(blank, 'a blank value is a missing translation').toEqual([])
  })

  for (const locale of LOCALIZED) {
    it(`shares a value with the English baseline in ${locale} only for reviewed terms`, () => {
      expect(
        keysWhere(locale, (value, baseline) => value === baseline),
        'an extra row is an untranslated copy of the English text; a missing row is stale — drop it',
      ).toEqual([...SHARED_WITH_ENGLISH_BY_LOCALE[locale]].sort())
    })
  }

  it('keeps the English baseline free of Chinese outside reviewed examples', () => {
    expect(keysWhere(BASE_LOCALE, (value) => HAN.test(value ?? ''))).toEqual([...HAN_IN_ENGLISH].sort())
  })
})
