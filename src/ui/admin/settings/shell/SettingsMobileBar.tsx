import { SearchIcon, XIcon } from 'lucide-react'
import { useRef } from 'react'
import { useNavigate } from 'react-router'

import { useSettingsSearchFilter } from '@/ui/admin/settings/shell/useSettingsSearch'
import { Input } from '@/ui/components/input'
import { useI18n } from '@/ui/lib/I18nProvider'

export function SettingsMobileBar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { filter, setFilter } = useSettingsSearchFilter()
  const searchInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 bg-background p-8 lg:hidden">
      <div className="relative flex-1">
        <SearchIcon className="absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder={t('admin.settings.shell.searchPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 w-full rounded-xl border border-transparent bg-card pr-8 pl-9 text-sm shadow-sm"
          autoComplete="off"
          autoCorrect="off"
        />
        {filter ? (
          <button
            type="button"
            onClick={() => {
              setFilter('')
              searchInputRef.current?.focus()
            }}
            className="absolute top-1/2 right-2.5 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="sr-only">{t('admin.settings.shell.clearSearch')}</span>
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        title={t('common.action.close')}
        onClick={() => {
          void navigate(-1)
        }}
        className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-hidden"
      >
        <XIcon className="size-6" aria-hidden="true" />
        <span className="sr-only">{t('common.action.close')}</span>
      </button>
    </div>
  )
}
