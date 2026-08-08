import { z } from 'zod'

import { isSupportedTimeZone } from '@/server/domains/settings/timezones'

// `locale` is a BCP 47 tag; `timeZone` an IANA name; `timeFormat` a small token
// language consumed by `formatLocalDate` (`yyyy LL MM dd HH mm`).
export const generalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  website: z.url(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20),
  author: z.object({
    name: z.string().trim().min(1).max(60),
    email: z.email(),
    url: z.url(),
  }),
  locale: z.string().trim().min(2).max(35),
  // Perimeter validation: a hand-crafted POST bypassing the picker must not smuggle a bogus zone.
  timeZone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isSupportedTimeZone, { message: '必须是 IANA 时区名（如 Asia/Shanghai、UTC）' }),
  timeFormat: z.string().trim().min(1).max(40),
  initialYear: z.coerce.number().int().min(1970).max(9999),
  icpNo: z.string().trim().max(60).optional(),
  moeIcpNo: z.string().trim().max(60).optional(),
})

// No seed: the setup-time first write arrives complete from the install form.
export const generalSection = {
  scope: 'blog.general',
  key: 'siteIdentity',
  schema: generalSchema,
  defaults: null,
} as const
