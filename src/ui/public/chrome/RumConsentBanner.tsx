// Privacy consent banner for RUM request-identity forwarding.
//
// Rendered only when the site runs `observability.frontend.clientIdentity: forward` and the
// visitor has not decided yet; the root `App` owns the visibility/mount logic and the persisted
// decision. Accepting starts browser RUM (forwarding the coarse identity the VRL reduces to
// country and browser/OS/device family); declining permanently opts this browser out.

import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

interface RumConsentBannerProps {
  onAccept: () => void
  onDecline: () => void
}

export function RumConsentBanner({ onAccept, onDecline }: RumConsentBannerProps) {
  const { t } = useI18n()
  return (
    <div role="dialog" aria-label={t('public.rumConsent.title')} className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-lg border border-line-muted bg-background p-4 shadow-lg sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">{t('public.rumConsent.title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('public.rumConsent.body')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onDecline}>
            {t('public.rumConsent.decline')}
          </Button>
          <Button size="sm" onClick={onAccept}>
            {t('public.rumConsent.accept')}
          </Button>
        </div>
      </div>
    </div>
  )
}
