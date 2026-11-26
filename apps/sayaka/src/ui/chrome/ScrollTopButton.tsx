import { Button } from '@kobato/ui/components/button'
import { IconButtonContent } from '@kobato/ui/components/icon-button-content'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useShowOnScroll } from '@kobato/ui/lib/use-show-on-scroll'
import { ArrowUpIcon } from 'lucide-react'

export function ScrollTopButton() {
  const show = useShowOnScroll()
  const { t } = useI18n()
  return (
    <li
      aria-hidden={!show}
      className={cn(
        'transform-gpu',
        'transition-opacity duration-150 ease-out',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <Button
        variant="fab"
        size="iconLg"
        shape="pill"
        aria-label={t('public.chrome.scrollTop')}
        tabIndex={show ? 0 : -1}
        onClick={() => window.scrollTo({ left: 0, top: 0, behavior: 'smooth' })}
      >
        <IconButtonContent>
          <ArrowUpIcon size="1em" aria-hidden className="m-icon-inset" />
        </IconButtonContent>
      </Button>
    </li>
  )
}
