# Styles conventions

## Entry structure

- `dark-variant.css` — **the `dark` variant, single-sourced**: `.dark` class, or `prefers-color-scheme`
  when no class is set. Imported unlayered, before any utility compile, by `tailwind.css` and both
  inkling partials: the package sheet's own utility compile would otherwise use the media-only
  default, which fires under a dark OS on a class-locked-light site. Never import it with `layer(...)` —
  `@custom-variant` is rejected inside a cascade layer. The inkling demo uses
  `@/inkling/styles/variants.css` instead (keep the two semantics distinct). Pinned by
  `tests/unit/contract/dark-variant.test.ts`.
- `tailwind.css` — **shared token partial, not a standalone entry**: design tokens (`:root` / `.dark` /
  `prefers-color-scheme` / P3), the full `@theme inline` bridge, the `sidebar` `@custom-variant`,
  `@layer base` overrides, and shared rules (Shiki token colors, the theme-wipe view transition). No
  `@import 'tailwindcss'` and no `@source` — importing it from TSX produces nothing.
- `typeset.css` — **all content typography, one owned file** (vendored `shadcn/typeset` + kobato
  presets). `@layer components` holds the `.typeset` base rules first, then the kobato bridge and the
  `.typeset-post` (article body) / `.typeset-comment` presets: every rule sits at (0,1,0), so presets
  win ties by source order and the base MUST stay first. `@layer utilities` holds post-body chrome:
  table rules, the client-injected code-block header (`.post-content`-scoped), and the footnote
  hover-preview popover (global — it mounts on `document.body`, outside any `.typeset` container).
  - KOBATO PATCH #1: the opt-out guard also honors `.not-inkling-prose` and `.inkling-blockquote-alt`.
  - `--typeset-mobile-scale` (default 1.125×) drives the `<48rem` scale: `.typeset-post` opts out
    (sets 1), `.typeset-comment` keeps the bump.
  - ZOOM CONTRACT: the page-editor canvas runs under `zoom: 2/3`, so text-decorative lengths in the
    presets are authored in EM; no rem/px text metrics in the preset sections.
  - Presets ride the editor contentEditables via `contentEditableClassName` (`typeset typeset-post` /
    `typeset typeset-comment`).
- Entries: `public.css` (imported by `ui/public/chrome/BaseLayout.tsx`) and `admin.css` (imported by
  `routes/{admin,auth,editor}/layout.tsx`). Each owns `@import 'tailwindcss' source(none)`, imports
  `tailwind.css` and `typeset.css` (`public.css` adds `cursors.css`), and opens with a bare
  `@layer theme, base, inkling, components, utilities;` pinning `inkling` below `utilities` but above
  `base`: host-card utilities beat inkling's scoped preflight, and the host preflight cannot zero the
  package's own padding/margin utilities. Public-only: cursors, medium-zoom `z-index: 1080`, the
  comment hash-focus flash; admin-only: medium-zoom `z-index: 45`, `scrollbar-thin`.
  - `@source`, both entries: `root.tsx`, `ui/components`, `ui/icons`, `ui/lib`,
    `shared/lexical/cards` (projected host-card constants).
  - `@source` public adds: `routes/public`, `ui/public`. Admin adds: `routes/{admin,auth,editor}`,
    `ui/admin`, `ui/public/{music-player,chrome,widgets}`, `ui/public/Search.tsx`,
    `ui/public/comments/*.{ts,tsx}`, `client/editor`.
- `inkling-editor.css` — **page-editor canvas partial**, imported ONLY by
  `@/ui/admin/editor/PageBodyEditor` (editor route chunk only, so the rest of admin stays
  inkling-free). Imports `dark-variant.css` first, then `@/inkling/styles/index.css` into
  `layer(inkling)`, then UNLAYERED host rules:
  - `zoom: 2/3` normalizes inkling's 10px-root rem system to kobato's 15px root; canvas chrome
    arbitrary values are authored in rem at 0.1rem/px; `max-width` is divided by the zoom factor to
    keep the 740px effective article width.
  - Token bridge: `--inkling-accent-color` ← `--brand`, `--font-sans` ← `--font-body`,
    `--font-serif: inherit` (the contentEditable's `typeset-post` consumes it).
  - Spacing bridge: `--spacing: 0.4rem` on the canvas — kobato's compile emits the same class names
    and its `calc(var(--spacing) * N)` versions win the cascade.
  - Host-card token restore: re-declares `--text-*`, `--spacing` and flattened radii on every
    `data-inkling-card` chrome in `KOBATO_HOST_CARD_NODE_TYPES`, which inkling's scoped theme would
    otherwise shadow with 10px-root values (`tests/unit/contract/editor-host-card-tokens.test.ts`).
  - `--typeset-size: calc(1.125rem / 0.666667)` zoom compensation, placeholder font metrics,
    writing-focus dimming.
- `inkling-comment-editor.css` — **comment-canvas partial**, imported ONLY by
  `@/ui/public/comments/CommentBodyEditor` (static in both bundles). Same `dark-variant.css`
  pre-import and `inkling` layer import, plus `.kobato-comment-editor` host rules. NO ZOOM: CSS zoom
  on a contenteditable breaks Chromium/WebKit IME composition painting. Typography is owned by the
  `typeset-comment` preset (canvas overrides only `--typeset-leading` → rendered `1.85`). Rest: canvas
  box, token bridge, card interiors; no placeholder or slash menu.

New rules: both sides → `tailwind.css`; one side → its entry; canvas chrome → that canvas's inkling
partial. A component dir crossing sides (e.g. an admin page rendering a `ui/public` widget) must be
added to the other entry's `@source` list, or its utilities drop out.

## Design tokens

- Every custom property behind a utility must be declared in `@theme inline` in `tailwind.css` and
  registered in `src/ui/lib/cn.ts` under the matching namespace (`tests/unit/contract/tailwind-tokens.test.ts`).
- No arbitrary-value syntax for design-system tokens. Bad: `h-[var(--size-sidebar-item)]`. Good:
  register `--spacing-sidebar-item: var(--size-sidebar-item)` in `@theme inline`, add
  `'sidebar-item'` to `SPACING_TOKENS` in `cn.ts`, then use `h-sidebar-item`.
- No arbitrary-value syntax for size tokens: `w-[100px]`, `h-[20rem]`, `gap-[0.75rem]` are not
  acceptable. Declare a named token in `@theme inline` (e.g. `--spacing-*`) and use the utility.

## Border roles

`border-border` for containers, cards and dividers; `border-line-muted` for control outlines (inputs,
buttons, selects, filter pills, row actions). Keep primary, destructive, selected and focus borders
semantic. Do not introduce `border-input`, `border-line` or `border-ga-300` as resting control colors.

## Locale font chains

- `tailwind.css` owns the DEFAULT `--font-body` / `--font-serif` chains: `:root` carries the zh-CN
  chain; `:lang(en-US)` / `:lang(zh-TW)` / `:lang(zh-HK)` override it for the other AppLocales
  (`<html lang>` is the locale).
- A configured custom font still wins: `root.tsx` sets the token as an inline style on `<html>`,
  prepending the configured families to the SAME locale tail.
- The CSS branches and `DEFAULT_FONT_STACKS` in `src/shared/config/font-stacks.ts` are one contract
  (`tests/unit/contract/font-stacks.test.ts`). Never hardcode a fallback chain in TSX.

## Shadow tiers

`shadow-card` (`--shadow-card-value`, public content cards: post body, sidebar), `shadow-raised`
(`--shadow-raised`, admin cards, stat tiles), `shadow-popover` (`--shadow-popover`, dropdowns, menus,
selects, comboboxes, popovers), `shadow-modal` (`--shadow-modal`, dialogs, alert-dialogs, sheets).
`shadow-card` and `shadow-raised` are **not** aliased — the public card silhouette is softer than the
raised spec. Pick by context (public content → card, admin → raised); never mix them in one view.
