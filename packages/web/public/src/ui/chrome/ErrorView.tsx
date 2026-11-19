import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { NotWordPressView } from '@kobato/web-public/ui/chrome/NotWordPressView.tsx'
import { isRouteErrorResponse } from 'react-router'

const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'

export interface ErrorViewProps {
  error: unknown
  isDev?: boolean
}

export function ErrorView({ error, isDev }: ErrorViewProps) {
  const { t } = useI18n()

  if (isRouteErrorResponse(error) && error.status === 404 && error.statusText === NOT_WORDPRESS_STATUS_TEXT) {
    return <NotWordPressView />
  }

  const isNotFound = isRouteErrorResponse(error) && error.status === 404
  const title = isNotFound ? t('error.notFound.title') : t('error.boundary.title')
  let description = isNotFound ? t('error.notFound.description') : t('error.boundary.description')

  if (!isNotFound && isDev && error instanceof Error) {
    description = error.message
  }

  return (
    <div className="flex h-(--size-empty-state) flex-auto flex-col text-center">
      <div className="my-auto">
        <h1 className="font-number text-empty-state-hero">
          <span className="sr-only">{title}</span>
          {isNotFound ? '404' : '500'}
        </h1>
        <div>{description}</div>
      </div>
    </div>
  )
}
