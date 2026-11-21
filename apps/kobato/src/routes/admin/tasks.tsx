import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { TasksView } from '@kobato/web-admin/ui/jobs/TasksView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.tasks')

export default function WpAdminTasksRoute() {
  return <TasksView />
}
