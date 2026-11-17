import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { UsersView } from '@kobato/web/ui/admin/users/UsersView.tsx'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.users')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
