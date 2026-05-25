import type { ComponentProps } from 'react'

import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/ui/lib/cn'

// Button variants tuned to match the public site's `.btn` rules in
// `src/styles/_base.css`:
//
// 1. Generous horizontal padding (`px-5` ≈ 20px, vs upstream shadcn's
//    16px) so labels never feel cramped against the button edge. The
//    public site uses 0.375rem 1.625rem (6×26px); we land slightly more
//    compressed because admin chrome packs more controls per row.
// 2. `has-[>svg]:px-*` — DROPPED. shadcn's upstream collapses the
//    horizontal padding when an SVG is present, but virtually every
//    admin button is "icon + label" so that rule made every action
//    button look squeezed. Padding now stays uniform across icon-only
//    and icon+label buttons; icon-only callers still use `size: 'icon'`
//    which sets `size-9` and is square by design.
// 3. `default` hover changes the background to `bg-foreground` (the
//    dark navy `#151b2b` that matches the site's `--btn-dark` token)
//    instead of dimming the brand teal via `/90`. Same pattern for
//    `destructive` — hover swaps to the dark navy, telegraphing the
//    "this action is irreversible" vibe consistent with the public
//    site's btn-primary:hover behaviour.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4 [&_[data-icon]]:size-4 [&_[data-icon=sm]]:size-3 [&_[data-icon=lg]]:size-5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        // Brand teal at rest, hover swap driven by `--btn-hover-bg` /
        // `--btn-hover-fg` so the cascade can rebind it in dark mode.
        // Light mode keeps the public-site navy swap; dark mode dims
        // the brand teal (`hover:bg-foreground` would otherwise resolve
        // to light grey, hiding the white label).
        default: 'bg-btn-primary-bg text-primary-foreground hover:bg-btn-hover-bg hover:text-btn-hover-fg',
        // Destructive shares the same hover token pair so the firing
        // affordance reads identically in both modes.
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-btn-hover-bg hover:text-btn-hover-fg focus-visible:ring-destructive/20',
        // Light-red "clear" affordance — used for tertiary "undo"
        // actions like clearing a filter selection: visible enough to
        // signal "removes something" without competing with primary
        // CTAs. The bg uses the destructive token at low alpha so it
        // tracks the admin theme automatically. Modelled on a
        // historical public-site outline-danger look (`#ffe8e8`
        // background, `#f7094c` foreground); admin is the only
        // surviving consumer.
        'destructive-soft':
          'bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-destructive/20',
        // outline / secondary / ghost stay on the lighter `accent`
        // hover so secondary actions don't compete with the primary
        // call-to-action when several buttons share a row (e.g. the
        // comment-row toolbar where "审核 / 回复 / …" all sit together).
        outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // Public-site colourways — solid fills that match the retired
        // `publicButtonVariants` recipes. `light` is the muted chip used
        // for ScrollTop, comment cancel, share buttons. `dark` is the
        // solid navy used for Header social rail, QRDialog, search trigger.
        //
        // Dark mode lifts every part of the chip — fill to `line-muted`
        // (L 30, +9 L over the body `#1d2842`), edge to `line` (L 38),
        // glyph to `ink-1` (#e8e9ea) — so a `light` chip reads as
        // an obvious interactive widget against the dark body instead
        // of fading into it. Hover routes the glyph through `brand` for
        // a perceptible affordance. Light mode keeps the original
        // muted-rest / strong-hover pair because the icons sit on a
        // near-white card and don't need the extra contrast.
        light: 'border border-btn-light-border bg-btn-light-bg text-btn-light-fg hover:text-btn-light-hover-fg',
        dark: 'border border-brand-dark bg-brand-dark text-ink-on-dark hover:bg-brand-darker hover:border-brand-darker hover:text-white',
        // FAB — floating action buttons (ScrollTop, mobile ThemeToggle)
        // that sit over article content. Higher-contrast than `light`
        // so the chip reads against post imagery in both themes; hover
        // keeps the resting palette because FABs are isolated and the
        // cursor + tap are the affordance.
        fab: 'bg-fab-bg text-fab-fg shadow-tooltip hover:bg-fab-bg hover:text-fab-fg',
      },
      size: {
        default: 'h-10 px-5 py-2.5',
        sm: 'h-9 rounded-md gap-1.5 px-3.5 py-2',
        lg: 'h-11 rounded-md px-7 py-2.5',
        icon: 'relative size-9',
        // Public-site icon-button sizes square-only zero padding. `relative` is
        // required so the centred `<IconButtonContent>` span anchors against
        // the button itself rather than escaping to the nearest positioned
        // ancestor (e.g. the sticky aside drawer).
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
  // Use Base UI's `defaultTagName` to provide the fallback element (a
  // plain `<button>`) and put defaults — including `type="button"` —
  // into the `props` bag. `useRender` treats the render element as the
  // user-supplied template whose props win over `props`; if we put
  // `type="button"` inside `<button type="button" />`, a caller's
  // `type="submit"` would be silently ignored, breaking form submits
  // (#admin-save-no-submit). Putting it in `props` lets the spread
  // order (`...props` last) override it cleanly.
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
