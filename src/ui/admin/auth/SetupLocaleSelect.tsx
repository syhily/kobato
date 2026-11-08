import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES, type AppLocale } from '@/shared/i18n/locales'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { useI18n } from '@/ui/lib/I18nProvider'

const LOCALE_ITEMS = SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: LOCALE_DISPLAY_NAMES[locale] }))

interface SetupLocaleSelectProps {
  value: AppLocale
  onValueChange: (locale: AppLocale) => void
  disabled?: boolean
}

export function SetupLocaleSelect({ value, onValueChange, disabled = false }: SetupLocaleSelectProps) {
  const { t } = useI18n()

  return (
    <div className="flex w-full flex-col gap-2">
      <Label htmlFor="setup-locale" className="font-semibold text-(--text-admin-base)">
        {t('auth.setup.locale')}
      </Label>
      <Select<AppLocale>
        items={LOCALE_ITEMS}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) {
            onValueChange(next)
          }
        }}
      >
        <SelectTrigger
          id="setup-locale"
          className="h-(--spacing-auth-input) w-full rounded-xl border-0 bg-muted/50 px-4 text-xl focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 md:text-xl"
          aria-describedby="setup-locale-hint"
        >
          <SelectValue>
            {(current: AppLocale | null) => (current === null ? '' : LOCALE_DISPLAY_NAMES[current])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LOCALES.map((locale) => (
            <SelectItem key={locale} value={locale}>
              {LOCALE_DISPLAY_NAMES[locale]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id="setup-locale-hint" className="text-sm text-muted-foreground">
        {t('auth.setup.localeHint')}
      </p>
    </div>
  )
}
