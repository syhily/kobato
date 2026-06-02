import type { ComponentProps } from 'react'

import { cn } from '@/ui/lib/cn'
import { cva, type VariantProps } from '@/ui/lib/cva'

// Size scale, by intent:
//
//   default (h-9) — densely-packed admin form rows. Matches shadcn idiomatic
//     density and pairs with `<Button size="sm">` (also h-9).
//   md      (h-10) — pairs with `<Button>` default (h-10). Use this when the
//     input sits in the same row as a primary button.
//   lg      (h-11) — public-site search bar; pairs with `<Button size="lg">`.
const inputVariants = cva(
  'flex w-full min-w-0 rounded-sm border border-line bg-transparent transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-(--ring-width) focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
  {
    variants: {
      size: {
        default: 'h-9 px-3 py-1 text-base md:text-sm',
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
