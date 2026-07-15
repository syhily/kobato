import type { ComponentProps } from 'react'

import { Switch as BaseSwitch } from '@base-ui/react/switch'

import { cn } from '@/ui/lib/cn'

/**
 * Base UI Switch wrapper. When used inside native forms, ensure you pass
 * `uncheckedValue` (or control the value via RHF Controller) so the unchecked
 * state is submitted correctly.
 */
function Switch({ className, ...props }: ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-5 data-[unchecked]:translate-x-0"
      />
    </BaseSwitch.Root>
  )
}

export { Switch }
