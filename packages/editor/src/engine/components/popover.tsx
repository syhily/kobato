import type { ComponentProps } from 'react'

import { Popover as BasePopover } from '@base-ui/react/popover'
import { LazyMotionDiv } from '@kobato/editor/engine/components/lazy-motion'
import { cn } from '@kobato/editor/engine/lib/cn'
import { transitions } from '@kobato/editor/engine/lib/motion'

function Popover({ ...props }: ComponentProps<typeof BasePopover.Root>) {
  return <BasePopover.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: ComponentProps<typeof BasePopover.Trigger>) {
  return <BasePopover.Trigger data-slot="popover-trigger" {...props} />
}

interface PopoverContentProps extends ComponentProps<typeof BasePopover.Popup> {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
}

function PopoverContent({
  className,
  align = 'center',
  side,
  sideOffset = 4,
  children,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner side={side} sideOffset={sideOffset} align={align} className="z-(--z-modal)">
        <BasePopover.Popup
          data-slot="popover-content"
          className={cn(
            'z-(--z-modal) w-72 origin-[var(--transform-origin)] rounded-md border bg-popover p-4 text-popover-foreground shadow-popover outline-none',
            'transition-all duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          <LazyMotionDiv
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...transitions.menu, delay: 0.02 }}
            className="contents"
          >
            {children}
          </LazyMotionDiv>
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  )
}

function PopoverClose({ ...props }: ComponentProps<typeof BasePopover.Close>) {
  return <BasePopover.Close data-slot="popover-close" {...props} />
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger }
