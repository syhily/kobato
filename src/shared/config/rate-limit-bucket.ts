import { z } from 'zod'

import { rateLimitBounds } from '@/shared/config/defaults'

// One rate-limit bucket's validation schema — the single source shared by the
// server section schema (`server/domains/settings/sections/rate-limit`) and the
// admin form's client-side mirror (`ui/admin/settings/ThresholdForm`), so an
// out-of-range value is rejected with the SAME message on both sides. The
// messages are user-facing: a server-rejected save surfaces them in the toast
// through the ORPCError issues channel.
export const rateLimitBucketSchema = z.object({
  windowSeconds: z.coerce
    .number()
    .int('时间窗口必须是整数秒')
    .min(rateLimitBounds.windowSeconds.min, `时间窗口不能小于 ${rateLimitBounds.windowSeconds.min} 秒`)
    .max(rateLimitBounds.windowSeconds.max, `时间窗口不能超过 ${rateLimitBounds.windowSeconds.max} 秒（24 小时）`),
  maxAttempts: z.coerce
    .number()
    .int('最大尝试次数必须是整数')
    .min(rateLimitBounds.maxAttempts.min, `最大尝试次数不能小于 ${rateLimitBounds.maxAttempts.min}`)
    .max(rateLimitBounds.maxAttempts.max, `最大尝试次数不能超过 ${rateLimitBounds.maxAttempts.max}`),
})
