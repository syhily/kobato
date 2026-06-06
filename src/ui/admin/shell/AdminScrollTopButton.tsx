import type { RefObject } from 'react'

import { ArrowUpIcon } from 'lucide-react'

import { useShowOnScroll } from '@/client/hooks/use-show-on-scroll'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

export interface AdminScrollTopButtonProps {
  /** When set (live preview / focus mode), depth is read from `<main>` instead of `window`. */
  scrollRootRef?: RefObject<HTMLElement | null>
  lifted?: boolean
}

export function AdminScrollTopButton({ scrollRootRef, lifted = false }: AdminScrollTopButtonProps) {
  const show = useShowOnScroll(300, scrollRootRef)

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="回到顶部"
      onClick={() => {
        const main = scrollRootRef?.current
        if (main) {
          main.scrollTo({ top: 0, behavior: 'smooth' })
        } else {
          window.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
        }
      }}
      className={cn(
        'fixed z-40',
        lifted ? 'right-4 bottom-20 lg:right-6 lg:bottom-24' : 'right-4 bottom-4 lg:right-6 lg:bottom-6',
        'size-11 rounded-full shadow-lg transition-all duration-200',
        'bg-secondary text-muted-foreground hover:bg-secondary hover:text-foreground',
        show ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUpIcon data-icon="lg" />
    </Button>
  )
}
