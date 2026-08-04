import { useShowOnScroll } from '@kobato/client/hooks/use-show-on-scroll'
import { Button } from '@kobato/ui/components/button'
import { IconButtonContent } from '@kobato/ui/components/icon-button-content'
import { cn } from '@kobato/ui/lib/cn'
import { ArrowUpIcon } from 'lucide-react'

// Toggle visibility with `opacity` + `pointer-events` instead of `display`
// to avoid iOS Safari compositor ghosting during scroll. `transform-gpu`
// promotes the host to its own layer so opacity stays GPU-accelerated.
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
