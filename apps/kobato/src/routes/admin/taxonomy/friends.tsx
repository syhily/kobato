import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { FriendsView } from '@kobato/web/ui/admin/friends/FriendsView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.friends')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
