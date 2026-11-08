import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { formatWallClockDateTime } from '@/ui/admin/editor-shell/wall-clock'
import { useI18n } from '@/ui/lib/I18nProvider'

interface CreateModeBannerProps {
  entityLabelId: UiMessageId
  draftSavedAt: number | null
}

export function CreateModeBanner({ entityLabelId, draftSavedAt }: CreateModeBannerProps) {
  const { locale, t } = useI18n()
  const entity = t(entityLabelId)
  return (
    <div className="flex items-center justify-between rounded-xl border border-destructive/10 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
      <span>{t('admin.editor.createBanner', { entity })}</span>
      {draftSavedAt !== null ? (
        <span className="font-mono">
          {t('admin.editor.createDraftRestored', {
            time: formatWallClockDateTime(new Date(draftSavedAt), locale),
          })}
        </span>
      ) : null}
    </div>
  )
}
