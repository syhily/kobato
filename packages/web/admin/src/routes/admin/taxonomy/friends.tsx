import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { FriendsView } from '@kobato/web-admin/ui/friends/FriendsView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.friends')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
