import { ArrowUpIcon } from 'lucide-react'

import { useShowOnScroll } from '@/client/hooks/use-show-on-scroll'
import { Button } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { cn } from '@/ui/lib/cn'

// `opacity` + `pointer-events` (not `display`) avoids iOS Safari scroll ghosting; `transform-gpu` keeps opacity GPU-accelerated.
export function ScrollTopButton() {
  const show = useShowOnScroll()
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
        aria-label="回到顶部"
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
