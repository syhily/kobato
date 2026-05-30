import type { ComponentProps } from 'react'

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { CheckIcon } from 'lucide-react'

import { cn } from '@/ui/lib/cn'

function Checkbox({ className, ...props }: ComponentProps<typeof BaseCheckbox.Root>) {
  // Base UI's `Checkbox.Root` renders a `<span role="checkbox">`, not a
  // `<button>` like Radix does (intentional change to fix wrapping-label
  // a11y, see base-ui PR #3205). On a span, `width` / `height` from
  // `size-4` are ignored unless we promote the box to a block-level
  // formatting context. Without `inline-flex`, the box collapses to
  // a 1px tall vertical line in the rendered DOM (visible in the user
  // table screenshot before this fix).
  return (
    <BaseCheckbox.Root
      data-slot="checkbox"
      className={cn(
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-(--ring-width) focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground',
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
