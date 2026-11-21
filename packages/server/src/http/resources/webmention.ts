import type { Env } from '@kobato/server/http/hono-env'

import { enqueueWebmention } from '@kobato/server/domains/webmentions/inbox-enqueue'
import { webmentionReceiveSchema } from '@kobato/server/domains/webmentions/schema'
import { dynamicBodyLimit } from '@kobato/server/http/middlewares/dynamic-body-limit'
import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit'
import { isWebmentionReceiveEnabled } from '@kobato/settings/getters'
import { Hono } from 'hono'

const MAX_FORM_BODY_BYTES = 16 * 1024

export const webmentionRouter = new Hono<Env>().post(
  '/webmention',
  rateLimitByIp('webmention', 'resource'),
  dynamicBodyLimit({
    maxSize: MAX_FORM_BODY_BYTES,
    onError: (c) => c.json({ error: { message: 'Payload too large' } }, 413),
  }),
  async (c) => {
    if (!isWebmentionReceiveEnabled(c.var.requestContext.settings)) {
      return c.json({ error: { message: 'This endpoint no longer accepts webmentions' } }, 410)
    }

    const body = await c.req.parseBody()
    const parsed = webmentionReceiveSchema.safeParse({ source: body.source, target: body.target })
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
