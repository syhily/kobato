import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { FontsView } from '@/ui/admin/fonts/FontsView'

import type { Route } from './+types/fonts'

// Self-hosted web-font library + slot assignment, managed outside the
// settings autosave framework (slot changes call `admin.fonts.setSlot`
// directly and revalidate). The loader only gates the admin role; data is
// fetched client-side via oRPC so the page is instantly interactive.
export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('网站字体')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
