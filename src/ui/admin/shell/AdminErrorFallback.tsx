import { isRouteErrorResponse, useRouteError } from 'react-router'

import { useI18n } from '@/ui/lib/I18nProvider'

export function AdminErrorFallback() {
  const { t } = useI18n()
  const error = useRouteError()
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : t('admin.shell.error.title')
  const message = isRouteErrorResponse(error)
    ? typeof error.data === 'string'
      ? error.data
      : error.statusText
    : error instanceof Error
      ? error.message
      : t('admin.shell.error.unknown')

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="flex max-w-md flex-col gap-2 text-center">
        <h1 className="text-lg font-semibold text-destructive">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
