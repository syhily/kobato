# Styles conventions

## Entry structure

Three files, two bundles:

- `tailwind.css` — **shared token partial**, not a standalone entry. Holds
  every raw design token (`:root` / `.dark` / `prefers-color-scheme` / P3),
  the full `@theme inline` bridge, `@custom-variant` blocks, `@layer base`
  overrides, and rules both sides render (`prose-blog`, body tables, the
  hydration-injected code-block chrome, APlayer
  icon sizing, the theme-wipe view transition). It has no
  `@import 'tailwindcss'`, no `@plugin`, and no `@source` — importing it
  directly from TSX produces nothing.
- `public.css` — **public entry**, imported by `ui/public/chrome/BaseLayout.tsx`.
  Owns `@import 'tailwindcss' source(none)` + the typography plugin, imports
  the shared partial and `cursors.css`, and scopes `@source` to public-rendered
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
  `ui/*` dirs, and the `ui/public` subdirs admin reuses — aplayer, chrome,
  comment editor, widgets, Search — plus `client/editor` for the inkling host
  cards and `shared/lexical/cards` for their chrome constants). Admin-only
  rules live here: medium-zoom z-45 stacking, `scrollbar-thin`, the
  music-library view transitions.
- `inkling-editor.css` — **editor-canvas partial**, imported ONLY by
  `@/ui/admin/editor/PageBodyEditor` so it rides the editor route chunk (the
  rest of admin stays inkling-free). Pulls `@inkling/editor/style.css` into
  the `inkling` cascade layer (pinned below `utilities` by `admin.css`'s bare
  `@layer` ordering statement, so host-card Tailwind utilities beat inkling's
  scoped preflight) and carries the deliberately UNLAYERED host rules: the
  canvas column (`zoom: 0.625` normalizes inkling's 10px-root rem system to
  kobato's 16px root; `max-width` is divided by the zoom factor to keep the
  740px effective article width), the design-token bridge
  (`--inkling-accent-color` ← `--brand`, `--font-sans` ← `--font-body`,
  `--font-serif: inherit` — inkling declares its own Inter/Georgia stacks on
  `.inkling-lexical` in its layer), and the writing-focus dimming.
- `inkling-comment-editor.css` — **comment-canvas partial** (R12), imported
  ONLY by `@/ui/public/comments/CommentBodyEditor` so it rides the lazy
  comment-editor chunk on BOTH bundles (the admin dialogs consume the same
  lazy boundary). Same `inkling` layer import (pinned by `public.css`'s /
  `admin.css`'s bare ordering statements) plus the `.kobato-comment-editor`
  host rules: a tighter `zoom: 0.55`, the compact min-height/padding, the
  same design-token bridge, and explicit text/placeholder sizing to the
  rendered comment's metrics (14px / 1.85, written pre-zoom as
  `calc(14px / 0.55)`; the placeholder is re-anchored to the padded text
  origin via the `kobato-comment-placeholder` class the editor passes as
  `placeholderClassName`).

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
