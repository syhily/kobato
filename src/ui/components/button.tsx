import type { ComponentProps } from 'react'

import { useRender } from '@base-ui/react/use-render'

import { cn } from '@/ui/lib/cn'
import { cva, type VariantProps } from '@/ui/lib/cva'

// Button variants matching the public site's `.btn` rules.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4 [&_[data-icon]]:size-4 [&_[data-icon=sm]]:size-3 [&_[data-icon=lg]]:size-5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-(--ring-width) aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default: 'bg-btn-primary-bg text-primary-foreground hover:bg-btn-hover-bg hover:text-btn-hover-fg',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-btn-hover-bg hover:text-btn-hover-fg focus-visible:ring-destructive/20',
        'destructive-soft':
          'bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-destructive/20',
        outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        light: 'border border-btn-light-border bg-btn-light-bg text-btn-light-fg hover:text-btn-light-hover-fg',
        dark: 'border border-brand-dark bg-brand-dark text-ink-on-dark hover:bg-brand-darker hover:border-brand-darker hover:text-white',
        fab: 'bg-fab-bg text-fab-fg shadow-tooltip hover:bg-fab-bg hover:text-fab-fg',
      },
      size: {
        default: 'h-10 px-5 py-2.5',
        sm: 'h-9 rounded-md gap-1.5 px-3.5 py-2',
        lg: 'h-11 rounded-md px-7 py-2.5',
        icon: 'relative size-9',
        iconSm: 'relative size-8',
        iconMd: 'relative size-btn-icon-md',
        iconLg: 'relative size-11',
      },
      /** Corner radius. `default` inherits `rounded-md` from the base. */
      shape: {
        default: '',
        circle: 'rounded-full',
        pill: 'rounded-[4rem]',
      },
      /** Layout. `default` keeps `inline-flex` from the base; `block` stretches to the parent's width. */
      block: {
        true: 'block w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  render?: useRender.RenderProp
}

function Button({ className, variant, size, shape, block, render, ...props }: ButtonProps) {
  // Put `type="button"` in `props` (not the JSX tag) so caller `type="submit"` wins via spread order.
  const element = useRender({
    defaultTagName: 'button',
    render,
    props: {
      type: 'button',
      'data-slot': 'button',
      ...props,
      className: cn(buttonVariants({ variant, size, shape, block, className })),
    },
  })
  return element
}

export { Button, buttonVariants }
