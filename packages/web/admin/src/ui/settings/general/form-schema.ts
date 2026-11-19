import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { SiteIdentitySettings } from '@kobato/settings/types.ts'

import { SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { z } from 'zod'

export interface TimeZoneItem {
  value: string
  label: string
}

const MSG = {
  titleRequired: 'admin.settings.validation.titleRequired',
  separatorRequired: 'admin.settings.validation.separatorRequired',
  descriptionRequired: 'admin.settings.validation.descriptionRequired',
  websiteInvalid: 'admin.settings.validation.websiteInvalid',
  keywordRequired: 'admin.settings.validation.keywordRequired',
  keywordsMax: 'admin.settings.validation.keywordsMax',
  authorNameRequired: 'admin.settings.validation.authorNameRequired',
  emailInvalid: 'admin.settings.validation.emailInvalid',
  localeRequired: 'admin.settings.validation.localeRequired',
  timeZoneRequired: 'admin.settings.validation.timeZoneRequired',
  timeFormatRequired: 'admin.settings.validation.timeFormatRequired',
  max10: 'admin.settings.validation.maxChars10',
  max40: 'admin.settings.validation.maxChars40',
  max60: 'admin.settings.validation.maxChars60',
  max64: 'admin.settings.validation.maxChars64',
  max120: 'admin.settings.validation.maxChars120',
  max240: 'admin.settings.validation.maxChars240',
  initialYearMin: 'admin.settings.validation.initialYearMin',
  initialYearMax: 'admin.settings.validation.initialYearMax',
} as const satisfies Record<string, UiMessageId>

export const TIME_FORMAT_AUTO = 'auto'
export const TIME_FORMAT_CUSTOM = 'custom'
export const DEFAULT_TIME_FORMAT_PATTERN = 'yyyy-LL-dd HH:mm'

export const generalFormSchema = z.object({
  title: z.string().trim().min(1, MSG.titleRequired).max(120, MSG.max120),
  titleSeparator: z.string().trim().min(1, MSG.separatorRequired).max(10, MSG.max10),
  description: z.string().trim().min(1, MSG.descriptionRequired).max(240, MSG.max240),
  website: z.url({ message: MSG.websiteInvalid }),
  keywords: z
    .array(
      z.object({
        value: z.string().trim().min(1, MSG.keywordRequired).max(60, MSG.max60),
      }),
    )
    .max(20, MSG.keywordsMax),
  author: z.object({
    name: z.string().trim().min(1, MSG.authorNameRequired).max(60, MSG.max60),
    email: z.email({ message: MSG.emailInvalid }),
    url: z.url({ message: MSG.websiteInvalid }),
  }),
  locale: z.enum(SUPPORTED_LOCALES, { message: MSG.localeRequired }),
  timeZone: z.string().trim().min(1, MSG.timeZoneRequired).max(64, MSG.max64),
  timeFormat: z.string().trim().min(1, MSG.timeFormatRequired).max(40, MSG.max40).nullable(),
  initialYear: z.coerce.number().int().min(1970, MSG.initialYearMin).max(9999, MSG.initialYearMax),
  icpNo: z.string().trim().max(60, MSG.max60).optional(),
  moeIcpNo: z.string().trim().max(60, MSG.max60).optional(),
})
export type GeneralFormValues = z.infer<typeof generalFormSchema>

export function toFormValues(source: SiteIdentitySettings): GeneralFormValues {
  return {
    title: source.title,
    titleSeparator: source.titleSeparator,
    description: source.description,
    website: source.website,
    keywords: source.keywords.map((value) => ({ value })),
    author: { name: source.author.name, email: source.author.email, url: source.author.url },
    locale: source.locale,
    timeZone: source.timeZone,
    timeFormat: source.timeFormat,
    initialYear: source.initialYear,
    icpNo: source.icpNo ?? '',
    moeIcpNo: source.moeIcpNo ?? '',
  }
}
