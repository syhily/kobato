# Styles conventions

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
