import { z } from 'zod'

import { isSupportedTimeZone } from '@/server/domains/settings/timezones'
import { DEFAULT_LOCALE, normalizeAppLocale, SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// `locale` is one of the four supported UI locales; `timeZone` an IANA name;
// `timeFormat` a small token language consumed by `formatLocalDate`
// (`yyyy LL MM dd HH mm ss`), or `null` to follow the locale default.

// `timeFormat` reads as `null` when absent/blank so a row written before the
// follow-the-locale model parses; every stored pattern is preserved verbatim
// (an existing site's display must not change on upgrade). A non-string
// (corrupt) value degrades to `null` rather than dropping the section.
const timeFormatReadSchema = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((value) => (value === null || value === undefined || value === '' ? null : value))
  .catch(null)

// READ schema — hydration parses every stored row with it. Rows written before
// the four-locale set existed carry a bare or script-qualified tag:
// canonicalize here so such a row can never drop the whole `siteIdentity`
// section (which hydration reads as "not installed"). Unknown tags fall back to
// the default instead of failing; the boot migration is the first line.
export const generalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  // `.default(...)` so rows persisted before this key existed still parse.
  titleSeparator: z.string().trim().min(1).max(10).default('-'),
  description: z.string().trim().min(1).max(240),
  website: z.url(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20),
  author: z.object({
    name: z.string().trim().min(1).max(60),
    email: z.email(),
    url: z.url(),
  }),
  // A non-string (corrupt) value degrades to the default tag — never to a
  // failed parse, which hydration would read as "not installed".
  locale: z.string().trim().max(35).catch(DEFAULT_LOCALE).transform(normalizeAppLocale),
  // Perimeter validation: a hand-crafted POST bypassing the picker must not smuggle a bogus zone.
  timeZone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isSupportedTimeZone, { message: '必须是 IANA 时区名（如 Asia/Shanghai、UTC）' }),
  timeFormat: timeFormatReadSchema,
  initialYear: z.coerce.number().int().min(1970).max(9999),
  icpNo: z.string().trim().max(60).optional(),
  moeIcpNo: z.string().trim().max(60).optional(),
})

// WRITE schema — the admin form only ever sends the closed locale set, and a
// custom pattern must be non-empty (blank means `null` = follow the locale).
export const generalWriteSchema = generalSchema.extend({
  locale: z.enum(SUPPORTED_LOCALES, { message: '请选择站点语言' }),
  timeFormat: z.string().trim().min(1).max(40).nullable(),
})

// No seed: the setup-time first write arrives complete from the install form.
export const generalSection = {
  scope: 'blog.general',
  key: 'siteIdentity',
  schema: generalSchema,
  writeSchema: generalWriteSchema,
  defaults: null,
} as const
