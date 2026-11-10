import { CircleHelpIcon } from 'lucide-react'

import { Tooltip } from '@/ui/components/tooltip'
import { useI18n } from '@/ui/lib/I18nProvider'

// The small "?" affordance next to a settings label: hover/focus opens the
// richer explanation (feature + prerequisites) that does not fit the inline
// hint under the control.
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
