import { XIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useI18n } from '@/ui/lib/I18nProvider'

export function SettingsCloseButton() {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <div className="fixed top-2 right-0 z-50 m-8 hidden justify-end lg:flex">
      <button
        type="button"
        title={t('admin.settings.shell.closeEsc')}
        onClick={() => {
          void navigate(-1)
        }}
        className="inline-flex items-center rounded-xl p-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-hidden"
      >
        <XIcon className="size-6" aria-hidden="true" />
        <span className="sr-only">{t('common.action.close')}</span>
      </button>
    </div>
  )
}
