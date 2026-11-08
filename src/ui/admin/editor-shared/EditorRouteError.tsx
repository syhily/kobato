import { ArrowLeftIcon, AlertTriangleIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface EditorRouteErrorProps {
  message: string
  /** Display-noun message id — the title renders as `admin.editor.routeErrorTitle`. */
  entityLabelId: UiMessageId
  /** Admin list path the back button returns to. */
  listPath: string
}

export function EditorRouteError({ message, entityLabelId, listPath }: EditorRouteErrorProps) {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dialog-max-h-sm flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangleIcon className="size-10 text-destructive" />
      <h1 className="text-lg font-semibold">{t('admin.editor.routeErrorTitle', { entity: t(entityLabelId) })}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button
        variant="outline"
        render={
          <Link to={listPath}>
            <ArrowLeftIcon /> {t('admin.editor.backToList')}
          </Link>
        }
      />
    </div>
  )
}
