import { getSayakaContext } from '@sayaka/server/request-context'
import { sinkUnhandledRejection, unwrapResource } from '@sayaka/server/unwrap'

import type { Route } from './+types/feed'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  return unwrapResource(
    sinkUnhandledRejection(
      ctx.client.public.feeds.rss({ ifNoneMatch: request.headers.get('if-none-match') ?? undefined }),
    ),
  )
}
