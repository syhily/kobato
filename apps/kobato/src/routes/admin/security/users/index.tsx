import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { UsersView } from '@kobato/web-admin/ui/users/UsersView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.users')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
