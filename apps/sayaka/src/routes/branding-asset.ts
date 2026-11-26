import { getSayakaContext } from '@sayaka/server/request-context'
import { sinkUnhandledRejection, unwrapResource } from '@sayaka/server/unwrap'

import type { Route } from './+types/branding-asset'

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const ctx = getSayakaContext({ context })
  return unwrapResource(
    sinkUnhandledRejection(
      ctx.client.public.branding.asset({
        path: url.pathname,
        original: url.searchParams.has('original'),
        ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
      }),
    ),
    { profile: 'binary' },
  )
}
