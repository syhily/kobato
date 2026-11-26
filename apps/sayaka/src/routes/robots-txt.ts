import { getSayakaContext } from '@sayaka/server/request-context'
import { robotsTxtResponse } from '@sayaka/server/site-files'

import type { Route } from './+types/robots-txt'

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  const boot = await ctx.bootstrap()
  return robotsTxtResponse(boot.blogSettings)
}
