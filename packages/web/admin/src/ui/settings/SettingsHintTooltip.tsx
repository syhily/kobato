import { Tooltip } from '@kobato/ui/components/tooltip.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { CircleHelpIcon } from 'lucide-react'

export function SettingsHintTooltip({ content }: { content: string }) {
  const { t } = useI18n()
  return (
    <Tooltip>
      <Tooltip.Trigger
        aria-label={t('admin.settings.shared.hintTooltip')}
        className="inline-flex cursor-help text-muted-foreground transition-colors hover:text-foreground"
      >
        <CircleHelpIcon className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content>{content}</Tooltip.Content>
    </Tooltip>
  )
}
