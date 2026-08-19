import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('友链管理')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
