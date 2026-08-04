import type { ComponentProps } from 'react'

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { cn } from '@kobato/ui/lib/cn'
import { CheckIcon } from 'lucide-react'

function Checkbox({ className, ...props }: ComponentProps<typeof BaseCheckbox.Root>) {
  // Base UI renders `<span role="checkbox">` (not `<button>`), so we need
  // `inline-flex` to give `size-4` a block-level formatting context.
  return (
    <BaseCheckbox.Root
      data-slot="checkbox"
      className={cn(
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-input border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}

export { Checkbox }
