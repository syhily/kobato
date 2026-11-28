import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { TasksView } from '@/ui/jobs/TasksView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.tasks')

export default function WpAdminTasksRoute() {
  return <TasksView />
}
