import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { TasksView } from '@kobato/web/ui/admin/tasks/TasksView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

// Data flows through the client-side `admin.jobs.*` oRPC queries; the loader is only the role gate.
export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.tasks')

export default function WpAdminTasksRoute() {
  return <TasksView />
}
