import { searchRedirectResponse } from '@sayaka/server/site-files'

import type { Route } from './+types/search'

export async function loader({ request }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams.get('q') ?? undefined
  return searchRedirectResponse(query)
}
