import { extendTailwindMerge } from 'tailwind-merge'

import { type ClassValue, clsx } from '@/ui/lib/clsx'

// Project-wide cn helper. Composes `clsx` with a project-customised
// `tailwind-merge` that registers every `@theme` token so custom
// utilities (e.g. `text-toc-toggle` vs `text-ink-3`) are classified
// into the correct group instead of being collapsed as "same prefix".
//
// Token lists below mirror the `@theme inline` blocks in
// `src/styles/tailwind.css`. Adding a new `--<ns>-foo` token there
// MUST be paired with a matching entry here — enforced by
// `tests/contract.tailwind-tokens.test.ts`. For the full design-
// system documentation see `src/ui/AGENTS.md` §Tailwind-merge tokens.

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
  'status-draft-bg',
  'status-draft-fg',
  'status-draft-border',
  'diff-change-bg',
  'diff-change-fg',
  'diff-change-border',
  'diff-insert-bg',
  'diff-insert-fg',
  'diff-insert-border',
  'diff-delete-bg',
  'diff-delete-fg',
  'diff-delete-border',
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
const RADIUS_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl', 'input'] as const

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
  'auth-input-pad',
  'badge-overlay-y',
  'btn-icon-md',
  'comment-avatar-gap',
  'editor-min',
  'editor-prose-min',
  'empty-state',
  'header-brand-b',
  'header-brand-x',
  'icon-inset',
  'search-trigger',
  'sidebar-item',
  'submenu-p',
  'submenu-px-lg',
  'toc-disc',
  'toc-disc-hover',
  'toc-disc-open',
  'toc-disc-open-hover',
  'toc-drawer',
  'toc-drawer-edge',
  'toc-toggle-edge-open',
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
