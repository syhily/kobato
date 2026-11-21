import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { DEFAULT_LOCALE, normalizeAppLocale, SUPPORTED_LOCALES } from '@kobato/i18n/locales'
import { isSupportedTimeZone } from '@kobato/settings/timezones'
import { z } from 'zod'

const generalMessages = {
  timeZoneInvalid: 'admin.settings.general.timeZoneInvalid',
  localeInvalid: 'admin.settings.general.localeInvalid',
} as const satisfies Record<string, UiMessageId>

const timeFormatReadSchema = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((value) => (value === null || value === undefined || value === '' ? null : value))
  .catch(null)

export const generalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  titleSeparator: z.string().trim().min(1).max(10).default('-'),
  description: z.string().trim().min(1).max(240),
  website: z.url(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20),
  author: z.object({
    name: z.string().trim().min(1).max(60),
    email: z.email(),
    url: z.url(),
  }),
  locale: z.string().trim().max(35).catch(DEFAULT_LOCALE).transform(normalizeAppLocale),
  timeZone: z.string().trim().min(1).max(64).refine(isSupportedTimeZone, { message: generalMessages.timeZoneInvalid }),
  timeFormat: timeFormatReadSchema,
  initialYear: z.coerce.number().int().min(1970).max(9999),
  icpNo: z.string().trim().max(60).optional(),
  moeIcpNo: z.string().trim().max(60).optional(),
})

export const generalWriteSchema = generalSchema.extend({
  locale: z.enum(SUPPORTED_LOCALES, { message: generalMessages.localeInvalid }),
  timeFormat: z.string().trim().min(1).max(40).nullable(),
})

export const generalSection = {
  scope: 'blog.general',
  key: 'siteIdentity',
  schema: generalSchema,
  writeSchema: generalWriteSchema,
  defaults: null,
} as const
