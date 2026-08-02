import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { enqueueWebmention } from '@/server/domains/webmentions/inbox-enqueue'
import { webmentionReceiveSchema } from '@/server/domains/webmentions/schema'
import { dynamicBodyLimit } from '@/server/http/middlewares/dynamic-body-limit'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { getBlogSettingsBundleSync, isWebmentionReceiveEnabled } from '@/shared/config/getters'

// Form-encoded webmention bodies carry exactly two URLs — anything
// larger is junk traffic, not a protocol peer. dynamicBodyLimit checks
// the declared content-length up front and streams bodies without one
// (chunked transfer-encoding) through a byte-counting passthrough, so
// the cap can never be bypassed by omitting the header.
const MAX_FORM_BODY_BYTES = 16 * 1024

// W3C Webmention receive endpoint. Unauthenticated by protocol design —
// the abuse load is carried by the per-IP resource rate limit plus the
// moderation queue. Verification is ASYNCHRONOUS
// (docs/plans/2026-08-02-webmention-async-inbox-design.md): the handler
// only validates the shape and delegates to `enqueueWebmention` (target
// resolution + queue insert), answering 202 at once; the inbox worker
// fetches the source, verifies the link, and lands the mention as
// pending. DomainError escapes to the perimeter onError handler, which
// maps it to 400/404 with a JSON body.
export const webmentionRouter = new Hono<Env>().post(
  '/webmention',
  rateLimitByIp('webmention', 'resourceIp'),
  dynamicBodyLimit({
    maxSize: MAX_FORM_BODY_BYTES,
    onError: (c) => c.json({ error: { message: 'Payload too large' } }, 413),
  }),
  async (c) => {
    // Receive switch OFF → 410 Gone. The check lives inside the handler
    // (after rate limit + body cap, R10) so the route stays registered
    // and those guards keep absorbing junk traffic either way — and it
    // reads the same `isWebmentionReceiveEnabled` predicate as the
    // discovery surfaces, so an unseeded section can never make the
    // declaration and the gate disagree.
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
