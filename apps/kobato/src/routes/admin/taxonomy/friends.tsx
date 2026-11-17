import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { FriendsView } from '@kobato/web/ui/admin/friends/FriendsView.tsx'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.friends')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
