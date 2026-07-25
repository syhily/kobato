import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { FontsView } from '@/ui/admin/fonts/FontsView'

import type { Route } from './+types/fonts'

// Self-hosted web-font library + slot assignment. A dedicated manager
// outside the settings autosave framework: slot changes call
// `admin.fonts.setSlot` directly and revalidate. The loader only enforces
// the admin role; data is fetched client-side via oRPC so the page is
// instantly interactive.
export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'admin')
  return null
}

export const meta = titleMeta('网站字体')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
