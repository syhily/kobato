import { useQuery } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { GROUP_META, GROUP_ORDER, TASK_CAPABILITIES } from '@/ui/admin/tasks/meta'
import { TaskCard } from '@/ui/admin/tasks/TaskCard'
import { Skeleton } from '@/ui/components/skeleton'
import { useI18n } from '@/ui/lib/I18nProvider'

function TasksSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  )
}

// Task center: polls the aggregated `admin.jobs.list` every 10s and renders
// one card per catalog task, bucketed by its catalog group.
export function TasksView() {
  const { t } = useI18n()
  const jobsQuery = useQuery(orpcQuery.admin.jobs.list.queryOptions({ input: {}, refetchInterval: 10_000 }))
  const data = jobsQuery.data

  return (
    <AdminListPage>
      <AdminListPage.Header title={t('admin.tasks.title')} description={t('admin.tasks.description')} />

      {jobsQuery.isLoading ? (
        <TasksSkeleton />
      ) : jobsQuery.error !== null || data === undefined ? (
        <p className="text-sm text-destructive">{t('admin.tasks.loadFailed')}</p>
      ) : (
        GROUP_ORDER.map((group) => {
          const tasks = data.tasks.filter((task) => task.group === group)
          if (tasks.length === 0) {
            return null
          }
          return (
            <section key={group} className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold">{t(GROUP_META[group].labelId)}</h2>
                <p className="text-sm text-muted-foreground">{t(GROUP_META[group].descriptionId)}</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.taskKey}
                    task={task}
                    migration={TASK_CAPABILITIES[task.taskKey].usesMigrationStatus ? data.storageMigration : undefined}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}
    </AdminListPage>
  )
}
