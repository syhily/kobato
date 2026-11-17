import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { TasksView } from '@kobato/web/ui/admin/tasks/TasksView.tsx'

// Data flows through the client-side `admin.jobs.*` oRPC queries; the loader is only the role gate.
export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.tasks')

export default function WpAdminTasksRoute() {
  return <TasksView />
}
