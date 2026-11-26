import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { UsersView } from '@/ui/users/UsersView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.users')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
