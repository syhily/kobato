import { getSayakaContext } from '@sayaka/server/request-context'
import { sinkUnhandledRejection, unwrapResource } from '@sayaka/server/unwrap'

import type { Route } from './+types/fonts-embedded'

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const ctx = getSayakaContext({ context })
  return unwrapResource(
    sinkUnhandledRejection(
      ctx.client.public.fonts.embedded({
        path: url.pathname,
        ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
        range: request.headers.get('range') ?? undefined,
        search: url.search,
      }),
    ),
    { profile: 'media', takeStream: () => ctx.takeResourceStream('public.fonts.embedded') ?? null },
  )
}
