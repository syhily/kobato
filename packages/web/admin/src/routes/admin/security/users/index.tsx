import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { UsersView } from '@kobato/web-admin/ui/users/UsersView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.users')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
