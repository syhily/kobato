import { Skeleton } from '@kobato/ui/components/skeleton.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { GROUP_META, GROUP_ORDER, TASK_CAPABILITIES } from '@kobato/web-admin/ui/jobs/meta.ts'
import { TaskCard } from '@kobato/web-admin/ui/jobs/TaskCard.tsx'
import { AdminListPage } from '@kobato/web-admin/ui/shared/list/AdminListPage.tsx'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { useQuery } from '@tanstack/react-query'

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
