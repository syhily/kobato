import { getSayakaContext } from '@sayaka/server/request-context'
import { sinkUnhandledRejection, unwrapResource, notFound } from '@sayaka/server/unwrap'

import type { Route } from './+types/images-calendar'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const filename = params.filename
  if (params.year === undefined || filename === undefined || !filename.endsWith('.png')) {
    notFound()
  }
  const ctx = getSayakaContext({ context })
  return unwrapResource(
    sinkUnhandledRejection(
      ctx.client.public.images.calendar({
        year: params.year,
        time: filename.slice(0, -'.png'.length),
        theme: 'light',
        ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
      }),
    ),
    { profile: 'binary' },
  )
}
