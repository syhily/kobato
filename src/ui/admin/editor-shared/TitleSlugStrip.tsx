import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { Input } from '@/ui/components/input'
import { useI18n } from '@/ui/lib/I18nProvider'

interface TitleSlugStripProps {
  entityLabelId: UiMessageId
  title: string
  slug: string
  onTitleChange: (value: string) => void
  onSlugChange: (value: string) => void
  disabled?: boolean
}

export function TitleSlugStrip({
  entityLabelId,
  title,
  slug,
  onTitleChange,
  onSlugChange,
  disabled,
}: TitleSlugStripProps) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label={t('admin.editor.titleField', { entity: t(entityLabelId) })}
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={t('admin.editor.titleField', { entity: t(entityLabelId) })}
        maxLength={200}
        disabled={disabled}
        className="h-auto border-0 bg-transparent px-0 text-2xl leading-tight font-bold tracking-tight shadow-none focus-visible:ring-0 md:text-3xl dark:bg-transparent"
      />
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>/</span>
        <Input
          aria-label={t('admin.editor.slugAria')}
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder={t('admin.editor.slugPlaceholder')}
          maxLength={80}
          disabled={disabled}
          className="h-7 grow border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
    </div>
  )
}
