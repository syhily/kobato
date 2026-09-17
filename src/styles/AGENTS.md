# Styles conventions

## Entry structure

Six files, two bundles:

- `dark-variant.css` — **the class-or-media `dark` variant, single-sourced**.
  Imported (unlayered, before anything that triggers a utility compile) by
  `tailwind.css` AND by the two inkling partials — the inkling package sheet
  owns a separate `tailwindcss/utilities` compile that would otherwise fall
  back to Tailwind's default media-only `dark` variant, whose rules fire
  under a dark OS even when the site is class-locked to light. Pinned by
  `tests/unit/contract/dark-variant.test.ts`.
- `tailwind.css` — **shared token partial**, not a standalone entry. Holds
  every raw design token (`:root` / `.dark` / `prefers-color-scheme` / P3),
  the full `@theme inline` bridge, the `sidebar` `@custom-variant` block,
  `@layer base` overrides, and rules both sides render (the Shiki token
  colors for non-typeset surfaces, the theme-wipe view transition). It has no
  `@import 'tailwindcss'` and no `@source` — importing it directly from TSX
  produces nothing.
- `typeset.css` — **all content typography in one owned file** (vendored
  from https://ui.shadcn.com/typeset.css on 2026-09-06, then extended with
  kobato's presets + identity — the retired `typeset-kobato.css` was merged
  in): the `@tailwindcss/typography` replacement. `@layer components` holds
  the `.typeset` base rules first, then the kobato bridge and the
  `.typeset-post` (article body, ex-prose-lg) / `.typeset-comment`
  (ex-prose-sm) presets — every rule sits at exactly (0,1,0), so the
  presets win ties against the base by source order and the base MUST stay
  first. `@layer utilities` holds the post-body content chrome: the table
  rules, the client-injected code-block header (`.post-content`-scoped), and
  the footnote hover-preview popover (global-scoped — the popover mounts on
  `document.body`, outside any `.typeset` container). Carries
  KOBATO PATCH #1 (documented in its header): the opt-out guard also honors
  `.not-inkling-prose` and `.inkling-blockquote-alt`. The `<48rem` mobile
  font scale is a preset variable (`--typeset-mobile-scale`, default
  1.125×): `.typeset-post` opts out (sets 1), `.typeset-comment` keeps the
  bump. Text-decorative lengths in the preset sections are authored in EM
  because the page-editor canvas runs under `zoom: 0.625` (see the ZOOM
  CONTRACT comment in the file header). The presets also ride the editor
  contentEditables via `contentEditableClassName` (the `typeset
typeset-post|typeset-comment` pair) — that is what makes the editor
  canvas WYSIWYG with the rendered output.
- `public.css` — **public entry**, imported by `ui/public/chrome/BaseLayout.tsx`.
  Owns `@import 'tailwindcss' source(none)`, imports the shared partial, then
  `typeset.css`, then `cursors.css`, and scopes `@source` to public-rendered
  dirs (`routes/public`, `ui/public`, `ui/components`, `ui/icons`,
  `ui/lib`, `root.tsx`, and `shared/lexical/cards` whose class constants render into
  the R10 card markup). A bare `@layer inkling, theme, base, components, utilities;`
  ordering statement at the top pins the inkling cascade layer below
  `utilities` (same trick as `admin.css`) so the comment editor's host rules
  win over inkling's scoped preflight. Public-only rules live here: cursors,
  the medium-zoom z-1080 stacking, the comment hash-focus flash.
- `admin.css` — **admin entry**, imported by `routes/{admin,auth,editor}/layout.tsx`.
  Same tailwindcss import + shared partial, but its `@source` scope covers
  admin-rendered dirs (`routes/{admin,auth,editor}`, `ui/admin`, the shared
  `ui/*` dirs, and the `ui/public` subdirs admin reuses — music-player, chrome,
  comment editor, widgets, Search — plus `client/editor` for the inkling host
  cards and `shared/lexical/cards` for their chrome constants). Admin-only
  rules live here: medium-zoom z-45 stacking, `scrollbar-thin`, the
  music-library view transitions.
- `inkling-editor.css` — **editor-canvas partial**, imported ONLY by
  `@/ui/admin/editor/PageBodyEditor` so it rides the editor route chunk (the
  rest of admin stays inkling-free). Imports `dark-variant.css` FIRST (so the
  package sheet's own utility compile uses the site's class-or-media `dark`
  variant), then pulls `@/inkling/styles/index.css` (the
  `src/inkling` layer's source stylesheet — formerly the package's `style.css`
  dist artifact) into the `inkling` cascade layer (pinned below `utilities` by
  `admin.css`'s bare
  `@layer` ordering statement, so host-card Tailwind utilities beat inkling's
  scoped preflight) and carries the deliberately UNLAYERED host rules: the
  canvas column (`zoom: 0.625` normalizes inkling's 10px-root rem system to
  kobato's 16px root; `max-width` is divided by the zoom factor to keep the
  740px effective article width), the design-token bridge
  (`--inkling-accent-color` ← `--brand`, `--font-sans` ← `--font-body`,
  `--font-serif: inherit` — inkling declares its own Inter/Georgia stacks on
  `.inkling-lexical` in its layer, and the contentEditable's typeset-post
  preset consumes `--font-serif`), the host-card text-scale restore
  (re-declares kobato's `--text-*` scale on every `data-inkling-card` chrome
  in `KOBATO_HOST_CARD_NODE_TYPES` — inkling's scoped theme shadows that
  scale with its 10px-root values, which ballooned the music player's
  `text-xs` time labels until they wrapped; pinned by
  `tests/unit/contract/editor-host-card-tokens.test.ts`), the typeset zoom
  compensation (`--typeset-size: calc(1.125rem / 0.625)` — the one rem value
  in an otherwise all-em system), the placeholder font metrics, and the
  writing-focus dimming.
- `inkling-comment-editor.css` — **comment-canvas partial** (R12), imported
  ONLY by `@/ui/public/comments/CommentBodyEditor` (statically imported by
  the public comments island AND the admin dialogs, so it rides the route
  module graph on both bundles — no lazy boundary). Same `dark-variant.css`
  pre-import + `inkling` layer import (pinned by `public.css`'s /
  `admin.css`'s bare ordering statements) plus the `.kobato-comment-editor`
  host rules. NO ZOOM here (unlike the page editor): CSS zoom on a
  contenteditable breaks Chromium/WebKit IME composition painting.
  Typography is owned by the `typeset-comment` preset on the contentEditable
  (the canvas overrides only `--typeset-leading` to the rendered `1.85`);
  what remains here is the (transparent) canvas box, the token bridge, and
  card interiors. The surface mounts no placeholder (`placeholder={<></>}`
  on the InklingSurface) and no slash menu, so no placeholder or card-menu
  rules live here.

New rule placement: used by both sides → `tailwind.css`; one side only →
that side's entry; page-editor canvas chrome → `inkling-editor.css`;
comment-editor canvas chrome → `inkling-comment-editor.css`. A component dir that crosses sides (e.g. a new admin page
rendering a `ui/public` widget) needs its dir added to the other entry's
`@source` list, or its utilities silently drop out of that bundle.

## Skills

When modifying files in this directory, open and follow these skills first:

| Skill                   | Path                                            | Scope                                                        |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `shadcn`                | `.agents/skills/shadcn/SKILL.md`                | shadcn/ui component presets, `components.json`, token naming |
| `web-design-guidelines` | `.agents/skills/web-design-guidelines/SKILL.md` | Accessibility, color contrast, motion, focus states          |

## Design tokens

- Every CSS custom property that drives a Tailwind utility must be declared
  in `@theme inline` inside `tailwind.css` and registered in
  `src/ui/lib/cn.ts` under the matching namespace (`color`, `text`,
  `shadow`, `spacing`, etc.).
- **Do not use arbitrary-value syntax for design-system tokens**.
  Bad: `h-[var(--size-sidebar-item)]`.
  Good: register `--spacing-sidebar-item: var(--size-sidebar-item)` in
  `@theme inline`, add `'sidebar-item'` to `SPACING_TOKENS` in `cn.ts`,
  then use `h-sidebar-item`.
- **Do not use arbitrary-value syntax for size tokens**. Size values must be
  declared as named tokens in `@theme inline` (e.g. `--spacing-*`) and
  consumed through Tailwind utilities. Arbitrary values such as
  `w-[100px]`, `h-[20rem]`, or `gap-[0.75rem]` are not acceptable.
- The contract test in `tests/unit/contract/tailwind-tokens.test.ts`
  guards against drift between `tailwind.css` and `cn.ts`.

## Shadow tiers

Four shadow utilities, each with a distinct job:

| Utility          | Token                 | Use for                                                                     |
| ---------------- | --------------------- | --------------------------------------------------------------------------- |
| `shadow-card`    | `--shadow-card-value` | Public content cards (post body, sidebar) — intentionally soft (2% ambient) |
| `shadow-raised`  | `--shadow-raised`     | Admin cards, stat tiles — Geist crisp drop                                  |
| `shadow-popover` | `--shadow-popover`    | Dropdowns, menus, selects, comboboxes, popovers                             |
| `shadow-modal`   | `--shadow-modal`      | Dialogs, alert-dialogs, sheets                                              |

`shadow-card` and `shadow-raised` are **not** aliased — the public site's
card silhouette is deliberately softer than Geist's raised spec. Pick the
one that matches the surface's context (public content → card, admin →
raised), don't mix them within one view.
