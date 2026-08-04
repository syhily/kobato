import type { ComponentProps } from 'react'

import { Separator as BaseSeparator } from '@base-ui/react/separator'
import { cn } from '@kobato/editor/lib/cn'

type SeparatorProps = ComponentProps<typeof BaseSeparator>

function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <BaseSeparator
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
