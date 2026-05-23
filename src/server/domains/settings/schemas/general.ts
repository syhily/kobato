import { z } from 'zod'

import { isSupportedTimeZone } from '@/server/domains/settings/timezones'

// `locale` is a BCP 47 tag (e.g. `zh-CN`); `timeZone` is an IANA name
// (e.g. `Asia/Shanghai`); `timeFormat` is the project's small token
// language consumed by `formatLocalDate` (`yyyy LL MM dd HH mm`). Date
// fields live alongside site identity now so `/admin/settings/general`
// owns every "what does the site call itself, in what language" knob in
// one place.
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
  // The dropdown UI only offers values from `Intl.supportedValuesOf`,
  // but we still validate at the perimeter so a hand-crafted POST that
  // bypasses the picker can't smuggle a bogus zone into the JSONB
  // document — the formatters would silently throw at render time.
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
export type GeneralInput = z.infer<typeof generalSchema>
