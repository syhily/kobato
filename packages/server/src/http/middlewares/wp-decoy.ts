import type { Env } from '@kobato/server/http/context'

import { isWordPressDecoyPath, NOT_WORDPRESS_STATUS_TEXT } from '@kobato/shared/http/wp-decoy'
import { createMiddleware } from 'hono/factory'

/**
 * WordPress probe detector mounted as Hono middleware.
 *
 * The predicate (`isWordPressDecoyPath`) and the marker
 * (`NOT_WORDPRESS_STATUS_TEXT`) live in `@kobato/shared/http/wp-decoy` —
 * the headless public frontend mounts the same decoy so probes never
 * reach the React Router handler on either service.
 *
 * Previously lived in RR loaders (`page.detail` + `not-found`) so the
 * error boundary would render inside `<BaseLayout>`. After the Hono
 * migration the 404 response is returned directly by the HTTP layer;
 * the root React Router boundary still catches it and switches to
 * `<NotWordPressView />` via `statusText === 'Not WordPress'`.
 */
export const honoWpDecoyMiddleware = createMiddleware<Env>(async (c, next) => {
  if (isWordPressDecoyPath(c.req.path)) {
    return c.text(NOT_WORDPRESS_STATUS_TEXT, {
      status: 404,
      statusText: NOT_WORDPRESS_STATUS_TEXT,
    })
  }
  await next()
})
