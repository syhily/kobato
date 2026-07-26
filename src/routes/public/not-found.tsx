import { notFound } from '@/server/infra/http/status'

import type { Route } from './+types/not-found'

// Lowest-priority splat (`*`) — matched only when nothing else is, so it
// never shadows static or `:slug` routes. WordPress probes
// (`/wp-content/**`, `/cgi-bin/**`, `*.php`) never reach this loader: the
// Hono wp-decoy middleware answers them upstream with the canonical
// `Not WordPress` 404. Everything else is a genuine miss, so the loader
// unconditionally throws the plain 404, which the public layout's
// `ErrorBoundary` renders inside `<BaseLayout>`. The `default` component
// MUST exist even though the loader always throws: without it React
// Router treats the module as a resource route and streams the raw thrown
// `Response` to the client (text/plain, no chrome).
export function loader({ request: _request }: Route.LoaderArgs) {
  notFound()
}

export default function NotFoundRoute() {
  return null
}
