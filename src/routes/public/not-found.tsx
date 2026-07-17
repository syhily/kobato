import { notFound } from '@/server/infra/http/status'

import type { Route } from './+types/not-found'

// Lowest-priority splat (`*`) — React Router only matches it when nothing
// else does, so it never shadows static or `:slug` routes. WordPress
// probes (`/wp-content/**`, `/cgi-bin/**`, `*.php`) never reach this
// loader: the Hono wp-decoy middleware answers them upstream with the
// canonical `Not WordPress` 404. Everything that does arrive here is a
// genuine miss, so the loader unconditionally throws the plain 404 via
// `notFound()`, which the public layout's `ErrorBoundary` (with its
// synchronous `<BaseLayout>` shell) catches and renders as the regular
// 404 view. The `default` component MUST exist even though the loader
// always throws: without it React Router treats the module as a resource
// route and streams the raw thrown `Response` to the client (text/plain,
// no chrome). The presence of `default` makes it a UI route so the
// surrounding `ErrorBoundary` can render the right view.
export function loader({ request: _request }: Route.LoaderArgs) {
  notFound()
}

export default function NotFoundRoute() {
  return null
}
