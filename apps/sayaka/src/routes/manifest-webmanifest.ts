import { getSayakaContext } from '@sayaka/server/request-context'
import { manifestResponse } from '@sayaka/server/site-files'

import type { Route } from './+types/manifest-webmanifest'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  const boot = await ctx.bootstrap()
  return manifestResponse(boot.blogSettings, boot.i18n.locale, request.headers.get('if-none-match') ?? undefined)
}
