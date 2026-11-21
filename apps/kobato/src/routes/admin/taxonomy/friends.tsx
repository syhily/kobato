import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { FriendsView } from '@kobato/web-admin/ui/friends/FriendsView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.friends')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
