import { notFound } from '@kobato/server/infra/http/status'

import type { Route } from './+types/not-found'

export function loader({ request: _request }: Route.LoaderArgs) {
  notFound()
}

export default function NotFoundRoute() {
  return null
}
