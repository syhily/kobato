import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { UsersView } from '@/ui/admin/users/UsersView'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.users')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
