import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { UsersView } from '@kobato/web/ui/admin/users/UsersView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.users')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
