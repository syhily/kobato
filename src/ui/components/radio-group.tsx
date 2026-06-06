import type { ComponentProps } from 'react'

import { Radio as BaseRadio } from '@base-ui/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'

import { cn } from '@/ui/lib/cn'

function RadioGroup({ className, ...props }: ComponentProps<typeof BaseRadioGroup>) {
  return <BaseRadioGroup data-slot="radio-group" className={cn('grid w-full gap-3', className)} {...props} />
}

function RadioGroupItem({ className, ...props }: ComponentProps<typeof BaseRadio.Root>) {
  return (
    <BaseRadio.Root
      data-slot="radio-group-item"
      className={cn(
        'peer relative inline-flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border border-input outline-none',
        'after:absolute after:-inset-x-3 after:-inset-y-2',
        'focus-visible:border-ring focus-visible:ring-(--ring-width) focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-(--ring-width) aria-invalid:ring-destructive/20',
        'data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <BaseRadio.Indicator data-slot="radio-group-indicator" className="flex size-4 items-center justify-center">
        <span className="size-2 rounded-full bg-primary-foreground" />
      </BaseRadio.Indicator>
    </BaseRadio.Root>
  )
}

export { RadioGroup, RadioGroupItem }
