import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { enqueueWebmention } from '@/server/domains/webmentions/inbox-enqueue'
import { webmentionReceiveSchema } from '@/server/domains/webmentions/schema'
import { dynamicBodyLimit } from '@/server/http/middlewares/dynamic-body-limit'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { getBlogSettingsBundleSync, isWebmentionReceiveEnabled } from '@/shared/config/getters'

// Form bodies carry exactly two URLs — anything larger is junk. dynamicBodyLimit
// caps declared lengths up front and byte-counts chunked bodies too.
const MAX_FORM_BODY_BYTES = 16 * 1024

// W3C Webmention receive endpoint — unauthenticated by design (per-IP rate
// limit + moderation queue carry the abuse load). Verification is async:
// shape-only check + enqueue, 202 at once (docs/plans/2026-08-02-webmention-async-inbox-design.md).
export const webmentionRouter = new Hono<Env>().post(
  '/webmention',
  rateLimitByIp('webmention', 'resourceIp'),
  dynamicBodyLimit({
    maxSize: MAX_FORM_BODY_BYTES,
    onError: (c) => c.json({ error: { message: 'Payload too large' } }, 413),
  }),
  async (c) => {
    // OFF → 410, checked after the rate limit + body cap so those guards keep
    // absorbing junk; same predicate as the discovery surfaces (R10).
    if (!isWebmentionReceiveEnabled(getBlogSettingsBundleSync())) {
      return c.json({ error: { message: 'This endpoint no longer accepts webmentions' } }, 410)
    }

    const body = await c.req.parseBody()
    const parsed = webmentionReceiveSchema.safeParse({ source: body['source'], target: body['target'] })
    if (!parsed.success) {
      return c.json(
        { error: { message: 'Invalid webmention request: source and target must be valid http(s) URLs' } },
        400,
      )
    }

    await enqueueWebmention(c.var.requestContext.db, parsed.data)
    return c.json({ status: 'pending' }, 202)
  },
)
