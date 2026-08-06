# Styles conventions

## Entry structure

Three files, two bundles:

- `tailwind.css` — **shared token partial**, not a standalone entry. Holds
  every raw design token (`:root` / `.dark` / `prefers-color-scheme` / P3),
  the full `@theme inline` bridge, `@custom-variant` blocks, `@layer base`
  overrides, and rules both sides render (`prose-blog`, PT tables, APlayer
  icon sizing, the theme-wipe view transition). It has no
  `@import 'tailwindcss'`, no `@plugin`, and no `@source` — importing it
  directly from TSX produces nothing.
- `public.css` — **public entry**, imported by `ui/public/chrome/BaseLayout.tsx`.
  Owns `@import 'tailwindcss' source(none)` + the typography plugin, imports
  the shared partial and `cursors.css`, and scopes `@source` to public-rendered
  dirs (`routes/public`, `ui/public`, `ui/pt`, `ui/components`, `ui/icons`,
  `ui/lib`, `root.tsx`, plus `ui/admin/editor/tiptap` which the public comment
  editor reuses). Public-only rules live here: cursors, the medium-zoom
  z-1080 stacking, the comment hash-focus flash.
- `admin.css` — **admin entry**, imported by `routes/{admin,auth,editor}/layout.tsx`.
  Same tailwindcss import + shared partial, but its `@source` scope covers
  admin-rendered dirs (`routes/{admin,auth,editor}`, `ui/admin`, the shared
  `ui/*` dirs, and the `ui/public` subdirs admin reuses — aplayer, chrome,
  comment editor, widgets, Search). Admin-only rules live here: medium-zoom
  z-45 stacking, `scrollbar-thin`, the music-library view transitions.

New rule placement: used by both sides → `tailwind.css`; one side only →
that side's entry. A component dir that crosses sides (e.g. a new admin page
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
