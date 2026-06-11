import type { ComponentProps } from 'react'

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'

import { motion, transitions } from '@/client/lib/motion'
import { cn } from '@/ui/lib/cn'

function Sheet({ ...props }: ComponentProps<typeof BaseDialog.Root>) {
  return <BaseDialog.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: ComponentProps<typeof BaseDialog.Trigger>) {
  return <BaseDialog.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: ComponentProps<typeof BaseDialog.Close>) {
  return <BaseDialog.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: ComponentProps<typeof BaseDialog.Portal>) {
  return <BaseDialog.Portal data-slot="sheet-portal" {...props} />
}

function SheetBackdrop({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) {
  return (
    <BaseDialog.Backdrop
      data-slot="sheet-backdrop"
      className={cn(
        'fixed inset-0 z-(--z-modal) bg-scrim/80 backdrop-blur-sm transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

const sideClasses = {
  right:
    'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
  left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full',
  top: 'inset-x-0 top-0 h-auto border-b data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full',
  bottom:
    'inset-x-0 bottom-0 h-auto border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
} as const

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: ComponentProps<typeof BaseDialog.Popup> & { side?: keyof typeof sideClasses }) {
  return (
    <SheetPortal>
      <SheetBackdrop />
      <BaseDialog.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-(--z-modal) flex flex-col gap-4 bg-background shadow-lg transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]',
          sideClasses[side],
          className,
        )}
        {...props}
      >
        <motion.div
          initial={{
            opacity: 0,
            y: side === 'top' || side === 'bottom' ? 8 : 0,
            x: side === 'left' || side === 'right' ? (side === 'left' ? -8 : 8) : 0,
          }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={{ ...transitions.popup, delay: 0.05 }}
          className="contents"
        >
          {children}
        </motion.div>
        <BaseDialog.Close
          data-slot="sheet-close-button"
          className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4"
        >
          <XIcon />
          <span className="sr-only">关闭</span>
        </BaseDialog.Close>
      </BaseDialog.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
}

function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
}

function SheetTitle({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title data-slot="sheet-title" className={cn('font-semibold text-foreground', className)} {...props} />
  )
}

function SheetDescription({ className, ...props }: ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
