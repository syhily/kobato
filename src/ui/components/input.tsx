import type { ComponentProps } from 'react'

import { cn } from '@/ui/lib/cn'
import { cva, type VariantProps } from '@/ui/lib/cva'

const inputVariants = cva(
  'flex w-full min-w-0 rounded-sm border border-line-muted bg-transparent transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:shadow-focus aria-invalid:border-destructive',
  {
    variants: {
      size: {
        // default (40px) aligns with Button default (h-10). `md` is kept
        // as an alias for compatibility but resolves to the same height.
        default: 'h-10 px-3 py-2 text-base md:text-sm',
        md: 'h-10 px-3 py-2 text-base md:text-sm',
        lg: 'h-11 px-4 py-2 text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

function Input({
  className,
  type,
  size,
  ...props
}: Omit<ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>) {
  return <input type={type} data-slot="input" className={cn(inputVariants({ size }), className)} {...props} />
}

export { Input, inputVariants }
