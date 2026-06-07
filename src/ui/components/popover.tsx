import type { ComponentProps } from 'react'

import { Popover as BasePopover } from '@base-ui/react/popover'

import { cn } from '@/ui/lib/cn'

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
            'z-(--z-modal) w-72 origin-[var(--transform-origin)] rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            'transition-[transform,opacity] duration-150',
            className,
          )}
          {...props}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  )
}

function PopoverClose({ ...props }: ComponentProps<typeof BasePopover.Close>) {
  return <BasePopover.Close data-slot="popover-close" {...props} />
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger }
