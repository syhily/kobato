import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { FriendsView } from '@/ui/friends/FriendsView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.friends')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
