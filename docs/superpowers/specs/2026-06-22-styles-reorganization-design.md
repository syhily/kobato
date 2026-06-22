# Styles directory reorganization

**Date:** 2026-06-22
**Status:** Design — awaiting approval

## Problem

`src/styles/tailwind.css` is a 865-line monolith doing ~8 unrelated jobs.
Three concrete smells, discovered during exploration:

1. **Dead dark-mode block.** `tailwind.css:347-465` declares an identical
   copy of every `.dark` token value inside
   `@media (prefers-color-scheme: dark) { :root:not(.light, .dark) { … } }`.
   The selector `:root:not(.light, .dark)` matches `<html>` only when it has
   **neither** the `.light` nor `.dark` class. But the SSR root loader
   (`root.tsx:84-85`) always emits `className={theme ?? undefined}` where
   `theme` is read from the `kobato-blog-theme` cookie and resolved to
   `'dark' | 'light' | null`. When null, `<meta name="color-scheme">` is
   `'light dark'` but `<html>` has no class — and `ThemeProvider`
   (`ThemeProvider.tsx:68-74`) immediately applies `.light`/`.dark` on
   hydration. So the `@media` block matches at most for a few milliseconds
   pre-hydration on a cookieless first-visit, and `ThemeProvider`'s own
   resolve overrides it anyway. It's 118 lines of duplicated values that
   never take effect.

2. **Mis-named `inkling.css`.** The 472-line top-level file is the _published
   article + comment_ typography (`.post-content`, `.comment-content`),
   unrelated to the editor. Meanwhile the _actual_ inkling editor styles live
   in `src/styles/inkling/`. Two different things named "inkling."

3. **`public.css` imports editor CSS it doesn't use.** `public.css` imports
   `./inkling/index.css` (the Koenig editor chrome — toolbars, card menus,
   card controls). The article editor chrome classes (`.inkling-toolbar*`,
   `.inkling-cardmenu*`, `.inkling-card-*`) are only ever rendered by
   `src/ui/inkling/editor/**`, never on public routes. The public comment
   textarea DOES use `InklingEditor` (Lexical), but its toolbar is built with
   Tailwind utilities, not `.inkling-toolbar*`. So the public bundle carries
   ~400 lines of unused Koenig chrome.

### Latent bug discovered (pre-existing, fix as part of refactor)

The comment textarea's `InklingEditor` applies Lexical theme classes
`.inkling-text-bold/italic/underline/strikethrough/code` to inline `<span>`s.
But today those rules are scoped under `.inkling-prose .inkling-text-*`
(`inkling/editor.css`), and the comment textarea uses `comment-content`, not
`.inkling-prose`. So in the comment editor, bold/italic render via browser
defaults on `<strong>`/`<em>`, but **underline/strikethrough/code are
invisible while editing** — the classes are applied to the DOM but no CSS
rule matches. The published comment renders correctly because the server HTML
renderer (`server/render/inkling/html.ts:207-221`) emits native `<u>`/`<s>`/
`<code>` tags that `content.css`'s `.comment-content` rules style.

The refactor re-scopes `.inkling-text-*` to also cover `.comment-content`,
fixing the live-editing preview.

## Goal

Reorganize `src/styles/` into a small number of single-responsibility files,
delete dead code, and make `public.css` / `admin.css` true scene entry points
that pull exactly the CSS their scene needs.

## Non-goals

- No new design tokens, no token renames, no `@theme` value changes.
- No change to compiled CSS _semantics_ for any currently-working path. The
  only intentional behavioral change is the latent-bug fix (re-scoping
  `.inkling-text-*`).
- No change to `cursors.css` content (it gets folded into `base.css`).
- No change to `src/ui/` component code — all routing of which CSS loads
  happens through the two entry files.

## Current import graph

```
public.css  ──┐
              ├─→ tailwind.css ──→ @import cursors.css
admin.css   ──┘                  @import inkling.css   ← 472-line prose, mis-named
              │
              └──→ inkling/index.css   ← editor (preflight/editor/prose/toolbar)
```

Both entries import `inkling/index.css`. `public.css` also has a one-off
`.medium-zoom-overlay` z-index rule.

## Target structure (5 files at top level + 2 entry points)

```
src/styles/
├── tailwind.css     loader: @import tailwindcss, @custom-variant, @source,
│                     then ordered @imports. ~15 lines.
├── tokens.css       ALL design tokens: :root light + .dark. (No @media block.)
├── theme.css        @theme inline {} — Tailwind v4 utility bridge.
├── base.css         @layer base, html/body font, --font-body, reduced-motion,
│                     Shiki colors, APlayer icon, comment-flash, view-transitions,
│                     @layer utilities tweaks, custom cursors (folded from cursors.css).
├── content.css      Article + comment typography (.post-content, .comment-content).
│                     Renamed from inkling.css.
├── public.css       ENTRY — public site only.
├── admin.css        ENTRY — admin + editor.
└── inkling/         editor CSS, split by consumer:
    ├── core.css     shared editor primitives needed by BOTH the comment
    │                textarea and the article editor. Re-scoped .inkling-text-*
    │                format rules + .inkling-prose/.comment-content behavior
    │                resets. Consumed by BOTH entries.
    └── editor.css   article-editor-only chrome: floating toolbars, card menus,
                     card controls, card-container spacing. Consumed by admin only.
```

**File count goes from 14 → 9.** Today: `tailwind`, `cursors`, `inkling.css`,
`public`, `admin` (5 top-level) + `inkling/{index,preflight,editor,prose,toolbar}`
(5) = 10, plus the 3 new partials the monolith splits into. Target: 5
top-level (`tailwind`, `tokens`, `theme`, `base`, `content`) + 2 entries
(`public`, `admin`) + 2 inkling (`core`, `editor`) = 9. `cursors.css` and
`inkling.css` are deleted (folded into `base.css` / renamed to `content.css`).
`inkling/` drops from 5 files to 2.

### Why split `inkling/` into two files instead of keeping one

The comment textarea (`src/ui/public/comments/CommentBodyEditor.tsx`) mounts
a full `InklingEditor` and needs the Lexical theme's inline-format rules
(`.inkling-text-*`) plus the editor content reset. It does NOT need the
article editor's floating toolbars, card menus, or card chrome — those
classes are never rendered in the comment path (verified: the comment toolbar
is built entirely with Tailwind utility classes via `cn()`, not `.inkling-*`).

So the split is forced by the consumer graph:

| Consumer                | Needs `core.css` | Needs `editor.css` |
| ----------------------- | :--------------: | :----------------: |
| Public comment textarea |        ✓         |         ✗          |
| Article editor (admin)  |        ✓         |         ✓          |

`public.css` imports `inkling/core.css`; `admin.css` imports both.

## File-by-file migration

### `tailwind.css` → slim loader (~15 lines)

```css
@import 'tailwindcss' source(none);

@custom-variant dark {
  &:where(.dark, .dark *) {
    @slot;
  }
}

@custom-variant sidebar {
  &:where([data-sidebar='sidebar'], [data-sidebar='sidebar'] *) {
    @slot;
  }
}

@source '../..';

@import './tokens.css';
@import './theme.css';
@import './base.css';
@import './content.css';
@import './cursors.css';
```

Note: the `@custom-variant dark` block also drops its inner `@media
(prefers-color-scheme: dark)` arm — same dead-code reason as the token block.
`ThemeProvider` is the sole authority on the `.dark` class.

### `tokens.css` — all token definitions

Moves verbatim from `tailwind.css`:

- L24-201 `:root { … }` (light: raw brand + shadcn slots + misc primitives)
- L203-327 `.dark { … }`

**Deletes** L347-465 (`@media (prefers-color-scheme: dark) { … }`) — dead code.

### `theme.css` — Tailwind v4 bridge

Moves verbatim: L473-752 `@theme inline { … }`. No content change.

### `base.css` — everything structural

Moves from `tailwind.css`:

- L329-345 Shiki token colors (`pre.shiki { … }` + `.dark pre.shiki`)
- L467-471 `.comment-body.active` comment-flash
- L754-772 `@layer base { … }`
- L774-778 APlayer icon sizing
- L780-789 reduced-motion
- L791-819 `--font-body` + html/body

**Plus** the full contents of `cursors.css` (12 lines, 2 rules) — folded in.
`cursors.css` is deleted.

### `content.css` — article + comment typography

`git mv src/styles/inkling.css src/styles/content.css`. No content change.

### `inkling/core.css` — shared editor primitives

Concatenates + edits:

- All of current `inkling/preflight.css` (box-sizing, form-element reset) —
  but re-scoped to apply under both `.inkling-prose` and `.comment-content`.
- The `.inkling-text-*` inline-format rules from current `inkling/editor.css`
  (bold/italic/underline/strikethrough/code) — **re-scoped** from
  `.inkling-prose .inkling-text-*` to
  `:is(.inkling-prose, .comment-content) .inkling-text-*`. This fixes the
  latent comment-textarea bug.
- The `.inkling-prose` behavior rules from current `inkling/editor.css`
  (position:relative, `[contenteditable]` outline:none, `::selection` color,
  dark-mode selection). These stay scoped to `.inkling-prose` only — the
  comment textarea doesn't need them (it has its own focus ring via Tailwind).

### `inkling/editor.css` — article-editor chrome only

Concatenates:

- All of current `inkling/toolbar.css` (floating toolbar, card menu, card
  controls — `.inkling-toolbar*`, `.inkling-cardmenu*`, `.inkling-card-*`)
- All of current `inkling/prose.css` (card-container spacing rules — the
  `div[data-inkling-card]` selectors that only fire when decorator-rendered
  block cards are present, i.e. the article editor)

### Entry points

**`public.css`:**

```css
.medium-zoom-overlay,
.medium-zoom-image--opened {
  z-index: 1080;
}

@import './tailwind.css';
@import './inkling/core.css';
```

**`admin.css`:**

```css
@import './tailwind.css';
@import './inkling/core.css';
@import './inkling/editor.css';
```

Drops `@import './inkling/index.css'` from both; `index.css` is deleted.

## New import graph

```
public.css ──→ tailwind.css ──→ tokens.css ─ theme.css ─ base.css ─ content.css ─ cursors.css
            └── inkling/core.css

admin.css  ──→ tailwind.css ──→ (same 6 partials)
            ──→ inkling/core.css
            ──→ inkling/editor.css   (article-editor chrome only)
```

**Net deletions in the public CSS bundle:** ~518 lines (118 dead dark block

- ~400 article-editor chrome that public never renders).

## Verification plan

1. `pnpm run build` succeeds.
2. Diff compiled `build/client/assets/*.css`:
   - Public bundle: shrinks by ~518 lines. Remaining rules token-for-token
     identical to today minus the deleted dead code.
   - Admin bundle: identical cascade to today (it still gets core + editor).
3. `pnpm run type && pnpm run lint && pnpm run test` green.
4. **Manual smoke tests** (the latent-bug fix is a behavior change):
   - Public article page (`/`): dark-mode toggle works, article typography
     unchanged, no FOUC.
   - Public comment textarea: type `**bold**`, `_italic_`, `<u>` via toolbar
     — confirm underline and strikethrough now render visibly while editing
     (this is the bug fix).
   - Admin article editor (`/admin/posts/…/edit`): floating toolbar renders,
     slash/plus menu works, card chrome (image/code/math/music/table) renders
     with correct spacing.
   - Admin comment management: comment preview renders.

## Migration steps

1. Create `tokens.css`, `theme.css`, `base.css` by moving content out of
   `tailwind.css` (verbatim). Fold `cursors.css` content into `base.css`.
2. Rewrite `tailwind.css` as the slim loader. Delete `cursors.css`.
3. `git mv src/styles/inkling.css src/styles/content.css`. Update the one
   consumer (`tailwind.css` loader's `@import`).
4. Create `inkling/core.css` (preflight re-scoped + re-scoped
   `.inkling-text-*` + `.inkling-prose` behavior). Create `inkling/editor.css`
   (toolbar + card menu + card controls + card spacing). Delete
   `inkling/index.css`, `inkling/preflight.css`, `inkling/editor.css` (old),
   `inkling/prose.css`, `inkling/toolbar.css`.
5. Update `public.css` and `admin.css` to the new entry shape.
6. Run fmt/lint/type/test/build. Diff compiled CSS for both bundles.
7. Run manual smoke tests (§Verification plan).

## Risk

- **`@source '../..'` stays in `tailwind.css`** (the loader), not in a
  partial. Tailwind v4 scans from the file that declares `@source`.
- **Cascade order in the loader** must be: tokens → theme → base → content →
  cursors. Matches today's effective order (verified by reading the current
  `tailwind.css` line sequence).
- **The `.inkling-text-*` re-scoping is the only behavior change.** It makes
  underline/strikethrough/code visible in the comment editor live preview.
  Low risk (additive — rules that didn't match now match), and aligns the
  editing preview with the published output.
- **No contract test this time.** With the dead `@media` block deleted,
  there's only one `.dark { … }` block — nothing to keep in sync.

## Out of scope

- No `--dark-*` token aliasing (decided against — adds indirection for no
  benefit now that the duplicate block is deleted, not just co-located).
- No change to `src/ui/inkling/editor/**` component code.
- No change to route modules or `PublicChrome.tsx`.
