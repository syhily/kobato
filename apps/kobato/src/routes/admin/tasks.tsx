import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { TasksView } from '@kobato/web-admin/ui/jobs/TasksView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.tasks')

export default function WpAdminTasksRoute() {
  return <TasksView />
}
