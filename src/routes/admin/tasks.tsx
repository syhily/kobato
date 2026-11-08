import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { TasksView } from '@/ui/admin/tasks/TasksView'

// Data flows entirely through the client-side `admin.jobs.*` oRPC queries —
// the loader is only the role gate.
export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.tasks')

export default function WpAdminTasksRoute() {
  return <TasksView />
}
