import { useI18n } from '@/ui/lib/I18nProvider'

export function NotWordPressView() {
  const { t } = useI18n()
  return (
    <div className="flex h-(--size-empty-state) flex-auto flex-col text-center">
      <div className="my-auto">
        <h1 className="font-number text-empty-state-hero">404</h1>
        <div>{t('public.chrome.notWordPressTitle')}</div>
        <div className="mt-2 text-ink-4">{t('public.chrome.notWordPressDetail')}</div>
      </div>
    </div>
  )
}
