import { notFound } from '@/server/infra/http/status'

import type { Route } from './+types/not-found'

// Lowest-priority splat (`*`) — never shadows static or `:slug` routes. WordPress probes
// are answered upstream by the Hono wp-decoy middleware. The `default` component MUST
// exist even though the loader always throws: without it RR treats the module as a resource
// route and streams the raw thrown `Response` (text/plain, no chrome).
export function loader({ request: _request }: Route.LoaderArgs) {
  notFound()
}

export default function NotFoundRoute() {
  return null
}
