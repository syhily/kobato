import { getSayakaContext } from '@sayaka/server/request-context'
import { sinkUnhandledRejection, unwrapResource, notFound } from '@sayaka/server/unwrap'

import type { Route } from './+types/images-avatar'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const filename = params.filename
  if (filename === undefined || !filename.endsWith('.png')) {
    notFound()
  }
  const ctx = getSayakaContext({ context })
  return unwrapResource(
    sinkUnhandledRejection(
      ctx.client.public.avatar.image({
        hash: filename.slice(0, -'.png'.length),
        size: new URL(request.url).searchParams.get('s') ?? undefined,
      }),
    ),
    { profile: 'binary' },
  )
}
