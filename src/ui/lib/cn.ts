import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Project-wide cn helper. Composes clsx for falsy short-circuiting
// and array/object flattening with tailwind-merge for last-wins
// deduplication of conflicting Tailwind utilities.
//
// Why we extend tailwind-merge instead of using the default twMerge:
//
// Tailwind v4 looks at the namespace prefix of each --token to decide
// what kind of utility a token can drive. --text-* drives font-size,
// --color-* drives every text/bg/border/ring/decoration color slot,
// --shadow-* drives box-shadow, and so on. The CSS pipeline therefore
// already knows that text-toc-toggle is a font-size and that
// text-ink-3 is a color, even though they share the text-*
// utility prefix.
//
// tailwind-merge does not parse our @theme inline blocks. Out of the
// box it only knows the stock Tailwind v4 token names. Any custom
// token name -- text-toc-toggle, text-ink-3, shadow-card,
// shadow-tooltip, font-code, animate-shake, ... -- falls into a
// generic "unknown utility for prefix X" bucket and arbitrates
// against every other class with the same prefix as if they were
// the same group. The visible symptom is the bug we are fixing
// here: cn('text-toc-toggle text-ink-3') used to collapse
// to 'text-ink-3' alone, silently dropping the font-size.
//
// The fix is to register every project token name under the
// matching tailwind-merge theme key. Once registered, tailwind-merge
// classifies the utility into the correct group and the legacy
// "same-prefix collision" goes away. We register every namespace
// the project uses today even when no current cn() call site needs
// it, so a future regression cannot reintroduce the bug for a
// different token namespace.
//
// Token lists below mirror the @theme inline blocks in
// src/styles/tailwind.css. Adding a new --text-foo, --color-foo
// or --shadow-foo token there must be paired with a matching entry
// here. The unit test in tests/unit.cn.test.ts pins the contract so
// the regression is loud at CI time.
//
// Token system overview (read once, then forget):
//
//   tailwind.css layers tokens in three tiers, with one-way dataflow
//   from the bottom up:
//
//     1. Raw brand tokens — declared in `:root` and re-bound in
//        `.dark { … }`. They are the only place a hex value lives.
//        Examples: --brand, --ink-1, --surface-body,
//        --line-muted, --status-info-bg, --chip-bg, --btn-light-bg,
//        --fab-bg.
//
//     2. shadcn slot aliases — also in `:root`, mapped onto the raw
//        layer by name so the shadcn primitives (Button, Input,
//        Card, …) keep working unmodified:
//          --background ← --surface-body
//          --foreground ← --ink-1
//          --card / --popover ← --canvas
//          --muted / --secondary ← --surface-dim
//          --accent ← --line
//          --border ← --line
//          --input ← --line-widget
//          --ring ← --brand
//          --sidebar-* ← surface tier mirrors
//
//     3. `@theme inline` bridge — the same names with a `--color-`
//        (or `--shadow-`, `--text-`, …) prefix so Tailwind v4 emits
//        utilities for them. This file mirrors that prefix-stripped
//        list. `inline` keeps the tokens reactive to `.dark` rebinds
//        in tier 1, which is the whole point of the three-tier split.
//
//   Shadow tokens (e.g. --shadow-card) cannot be re-bound directly
//   in `.dark { }` because `@theme inline` tokens are immutable once
//   registered. That's why every shadow has a `*-value` indirection:
//   `.dark` rewrites --shadow-card-value, and the bridge alias
//   --shadow-card = var(--shadow-card-value) passes the new value
//   through transparently.
//
//   Practical rule for adding a new theme-aware utility:
//     a) define raw token in `:root` AND in `.dark { }` (tailwind.css)
//     b) bridge it in `@theme inline { --color-foo: var(--foo) }`
//     c) add 'foo' to the matching list below
//     d) consume as `bg-foo`/`text-foo`/… in TSX
//
//   Do NOT write `dark:bg-foo` on a token that lives in tier 1 — the
//   `.dark { }` rebind already handles theme switching, so the
//   `dark:` prefix is a no-op double declaration.
//
// Dark surface lightness ladder (the "L 7 to L 44" reference in
// `tailwind.css`'s comment above `--canvas`). Every adjacent tier
// carries 3 to 8 L of perceptible separation, and no `--line-*`
// token shares a value with any `--surface-*` token. The ladder
// dictates which tokens can sit on top of which:
//
//     secondary    (#0b1322,  L  7) — image dimmer overlays only
//     aside-bg     (#15203a,  L 14) — recessed sidebar
//     body         (#1d2842,  L 17) — page floor, cards rest here
//     canvas       (#26314d,  L 21) — card, popover, primary elevated
//     surface      (#26314d,  L 21) — sibling of canvas
//     surface-soft (#2a3553,  L 23) — soft chip / hover-state fill
//     surface-dim  (#303a5a,  L 26) — muted / secondary fill, input bg
//     line-muted   (#374566,  L 30) — recessed divider
//     line         (#475672,  L 38) — default border (cards, inputs, …)
//     line-widget  (#5b6b88,  L 44) — strong border (input emphasis)
//
// The earlier release had `--line === --surface-soft` (both
// `#2a3553`), which made every `border-line` consumer (Input,
// Textarea, SelectTrigger, sidebar dividers, accent hover fills)
// vanish on top of the soft surface. Lifting the line trio out of
// the surface band fixes form-element visibility, gives admin
// `<Card border>` a real outline, and restores `--accent` (which
// resolves to `--line` via the shadcn alias) as a perceptible
// hover-state.
//
// `--shiki-light` aside: Shiki emits a CSS variable named
// `--shiki-light` to carry its light-theme color. The project's
// `.dark` block re-binds that name to `var(--ink-2)` so that when
// Shiki's inline `--shiki-light` style is missing (e.g. body-text
// inside a `pre` with no Shiki span), the fallback still reads as
// foreground ink instead of literal white-on-dark.
//
// `--ink-on-dark` aside: this static near-white (`#e8e9ea`) does
// double duty. It is the foreground colour the Button `dark`
// variant uses on a dark navy fill (`text-ink-on-dark`), and it is
// also the forced-light background the QR dialog applies via
// `bg-ink-on-dark` so the rendered QR matrix stays scannable in
// dark mode (camera apps need a white background regardless of
// page theme). The name reads as "ink", but the second consumer
// uses it as a surface. Splitting into two tokens
// (`--ink-on-dark` + `--surface-static-light`) would be cleaner
// but each token would still resolve to the same hex; one
// consumer doesn't justify the extra registry entry.

// --text-* -- font-size scale
const TEXT_TOKENS = [
  'admin-sm',
  'admin-base',
  'badge',
  'btn-lg',
  'empty-state-hero',
  'md',
  'micro',
  'nano',
  'toc-link',
  'toc-title',
  'toc-toggle',
  '2xl',
] as const

// --color-* -- shared color scale used by text-, bg-, border-, ring-,
// decoration-, fill-, stroke-, ... utilities. Both the project-semantic
// names (canvas, surface, ink-*, brand, ...) and the shadcn slot names
// (background, primary, muted, accent, ...) live in the same scale.
const COLOR_TOKENS = [
  'accent',
  'accent-foreground',
  'alert',
  'aside-bg',
  'background',
  'border',
  'brand',
  'brand-dark',
  'brand-darker',
  'btn-hover-bg',
  'btn-hover-fg',
  'btn-light-border',
  'btn-light-bg',
  'btn-light-fg',
  'btn-light-hover-fg',
  'btn-primary-bg',
  'canvas',
  'card',
  'scrim',
  'skeleton-start',
  'skeleton-end',
  'card-foreground',
  'destructive',
  'destructive-foreground',
  'fab-bg',
  'fab-fg',
  'foreground',
  'ink-1',
  'ink-2',
  'ink-3',
  'ink-4',
  'ink-5',
  'ink-on-dark',
  'input',
  'like-active',
  'like-bg',
  'like-bg-hover',
  'line',
  'line-muted',
  'muted',
  'muted-foreground',
  'popover',
  'popover-foreground',
  'popup-close-hover',
  'primary',
  'primary-foreground',
  'ring',
  'secondary',
  'secondary-foreground',
  'sidebar',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-ring',
  'surface',
  'surface-body',
  'surface-dim',
  'surface-secondary',
  'surface-soft',
  'surface-warn',
  'warn',
  'widget-border',
  'status-info-bg',
  'status-info-fg',
  'status-info-border',
  'status-warn-bg',
  'status-warn-fg',
  'status-warn-border',
  'status-error-bg',
  'status-error-fg',
  'status-error-border',
  'status-success-bg',
  'status-success-fg',
  'status-success-border',
  'chip-bg',
  'chip-fg',
  'chip-hover-bg',
  'chip-hover-fg',
] as const

// --shadow-*. A few shadow names also live in the --color-* table
// e.g. shadow-card collides with color-card, shadow-like-active
// collides with color-like-active. Tailwind v4 accepts a colored
// shadow form shadow-<color>, so a token whose name lives in both
// namespaces is intentionally treated as ambiguous by tailwind-
// merge and will not collapse against another shadow utility.
// No current cn call site composes those tokens with a second
// shadow utility, so the limitation is theoretical only.
const SHADOW_TOKENS = ['card', 'like-active', 'popup-close', 'toc-toggle', 'tooltip'] as const

// --radius-* -- xs is the only project-only key; sm/md/lg/xl shadow
// the stock Tailwind v4 scale and tailwind-merge already knows them,
// but redeclaring them here is harmless and protects against an
// upstream key rename.
const RADIUS_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl'] as const

// --font-* -- font-family scale
const FONT_TOKENS = ['code'] as const

// --animate-*
const ANIMATE_TOKENS = ['shake', 'comments-shimmer', 'comment-flash'] as const

// --spacing-* -- the broad spacing scale that p-, m-, gap-, top-,
// w-, h-, ... all read from when they are given a custom token.
const SPACING_TOKENS = [
  'admin-col-narrow',
  'admin-thumb',
  'auth-btn',
  'auth-input',
  'badge-overlay-y',
  'btn-icon-md',
  'editor-min',
  'empty-state',
  'icon-inset',
  'search-trigger',
  'sidebar-item',
] as const

// Note: --leading-* is intentionally NOT registered. Tailwind v4
// links font-size and line-height through a built-in conflicting-
// class-groups rule so that text-<size> can carry an implicit
// line-height. tailwind-merge mirrors that rule, which means the
// moment a token name lives in BOTH the text and the leading scale
// e.g. --text-badge and --leading-badge a later text-badge eats
// the earlier leading-badge as if it were a redundant line-height.
// The project ships exactly one such pair, so the simplest fix is
// to leave leading-* unregistered. tailwind-merge then treats
// leading-badge as an opaque token that survives any neighbouring
// text utility, at the cost of not deduping against another
// custom leading utility -- which the project never composes.

const customTwMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TEXT_TOKENS],
      color: [...COLOR_TOKENS],
      shadow: [...SHADOW_TOKENS],
      radius: [...RADIUS_TOKENS],
      font: [...FONT_TOKENS],
      animate: [...ANIMATE_TOKENS],
      spacing: [...SPACING_TOKENS],
    },
  },
})

export type { ClassValue }

export function cn(...inputs: ClassValue[]): string {
  return customTwMerge(clsx(inputs))
}

// Test-only surface. The contract test in
// tests/contract.tailwind-tokens.test.ts diffs these against the
// @theme inline blocks in src/styles/tailwind.css so a forgotten
// registration is caught at CI time. Do not consume this from app code.
//
// REGISTERED_NAMESPACES is the set of @theme namespaces this file
// passes to extendTailwindMerge. Adding a new namespace requires
// adding it here too so the contract test knows to diff it.
//
// OMITTED_NAMESPACES is the set of @theme namespaces that exist in
// tailwind.css but are deliberately NOT registered. The only entry
// today is `leading`, for the reason documented above. Adding to
// this list must be a conscious call: the contract test fails on
// any namespace that is neither registered nor explicitly omitted,
// so the default outcome of dropping a new --<ns>-foo token into
// tailwind.css is a CI failure that forces a decision.
export const __TOKENS_FOR_TESTS = {
  registered: {
    text: TEXT_TOKENS,
    color: COLOR_TOKENS,
    shadow: SHADOW_TOKENS,
    radius: RADIUS_TOKENS,
    font: FONT_TOKENS,
    animate: ANIMATE_TOKENS,
    spacing: SPACING_TOKENS,
  } satisfies Record<string, ReadonlyArray<string>>,
  omitted: ['leading'] as const,
} as const
