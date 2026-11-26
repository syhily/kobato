import { getSayakaContext } from '@sayaka/server/request-context'
import { sinkUnhandledRejection, unwrapResource, notFound } from '@sayaka/server/unwrap'

import type { Route } from './+types/images-og-category'

export async function loader({ context, params }: Route.LoaderArgs) {
  const filename = params.filename
  if (filename === undefined || !filename.endsWith('.png')) {
    notFound()
  }
  const ctx = getSayakaContext({ context })
  return unwrapResource(
    sinkUnhandledRejection(ctx.client.public.images.og({ slug: filename.slice(0, -'.png'.length), category: true })),
    { profile: 'binary' },
  )
}
