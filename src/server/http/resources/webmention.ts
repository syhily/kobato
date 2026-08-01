import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { webmentionReceiveSchema } from '@/server/domains/webmentions/schema'
import { receiveWebmention } from '@/server/domains/webmentions/service'
import { dynamicBodyLimit } from '@/server/http/middlewares/dynamic-body-limit'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'

// Form-encoded webmention bodies carry exactly two URLs — anything
// larger is junk traffic, not a protocol peer. dynamicBodyLimit checks
// the declared content-length up front and streams bodies without one
// (chunked transfer-encoding) through a byte-counting passthrough, so
// the cap can never be bypassed by omitting the header.
const MAX_FORM_BODY_BYTES = 16 * 1024

// W3C Webmention receive endpoint. Unauthenticated by protocol design —
// the abuse load is carried by the per-IP resource rate limit plus the
// moderation queue. Verification is synchronous:
// 202 goes out only after the source has been fetched, verified to link
// to the target, and stored as pending. DomainError escapes to the
// perimeter onError handler, which maps it to 400/404 with a JSON body.
export const webmentionRouter = new Hono<Env>().post(
  '/webmention',
  rateLimitByIp('webmention', 'resourceIp', { errorBody: { error: 'Too many requests' } }),
  dynamicBodyLimit({ maxSize: MAX_FORM_BODY_BYTES, onError: (c) => c.json({ error: 'Payload too large' }, 413) }),
  async (c) => {
    const body = await c.req.parseBody()
    const parsed = webmentionReceiveSchema.safeParse({ source: body['source'], target: body['target'] })
    if (!parsed.success) {
      return c.json({ error: 'Invalid webmention request: source and target must be valid http(s) URLs' }, 400)
    }

    const mention = await receiveWebmention(c.var.requestContext.db, parsed.data)
    return c.json({ status: 'pending', id: mention.id.toString() }, 202)
  },
)
