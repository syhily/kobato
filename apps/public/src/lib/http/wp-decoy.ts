import { isWordPressDecoyPath, NOT_WORDPRESS_STATUS_TEXT } from '@kobato/shared/http/wp-decoy'
import { createMiddleware } from 'hono/factory'

/**
 * WordPress probe detector for the headless frontend perimeter.
 *
 * Byte-identical twin of the core server's `honoWpDecoyMiddleware`
 * (`packages/server/src/http/middlewares/wp-decoy.ts`): the predicate
 * and the marker come from the same shared module, and the response is
 * the same `404` + `Not WordPress` statusText. Probes must be answered
 * by the FIRST hop the scanner touches — under the two-service topology
 * that is the frontend, before the request can reach the React Router
 * handler (which would otherwise burn an SSR round-trip or fall through
 * to a generic 404 with a different statusText).
 */
export const frontendWpDecoyMiddleware = createMiddleware(async (c, next) => {
  if (isWordPressDecoyPath(c.req.path)) {
    return c.text(NOT_WORDPRESS_STATUS_TEXT, {
      status: 404,
      statusText: NOT_WORDPRESS_STATUS_TEXT,
    })
  }
  await next()
})
