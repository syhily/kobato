# UI style conventions

`packages/web/ui/src/styles/` contains only host-agnostic design-system partials. Product compilation entries and
`@source` graphs belong to the consuming app; Inkling host chrome lives outside this tree — the comment canvas chrome is
Inkling's own `packages/inkling/src/styles/comment-editor.css`, and only the page-editor host chrome
(`packages/web/admin/src/ui/styles/inkling-editor.css`) is the workspace's
(`packages/web/ui/tests/unit/contract/style-ownership.test.ts` forbids product imports, product scan graphs, and
additional product styles here).

## Generic styles

- `ui.css` is the design system's own compilation entry (tokens/typeset; scans only `components/`, `icons/`, `lib/`).
  Every utility the document shell, `BrandLogo`, `Image`, the locale-sync notice, and the reload overlay use is emitted
  here — the apps import it once per document, eagerly from `packages/web/admin/src/root.tsx` and
  `apps/sayaka/src/root.tsx` — route-level re-imports are forbidden; other consumers import it directly.
- `dark-variant.css` — the single `dark` variant (`.dark` class, or `prefers-color-scheme` when unset); import it
  unlayered before any utility compile. Partials composed into app surfaces must not re-declare it
  (`apps/kobato/tests/arch/tailwind-source-ownership.test.ts`).
- `base-defaults.css` — the base-layer border default every Tailwind compile must emit after its own preflight; surface
  entries import it non-reference (the compile-contract suite pins the ordering).
- `tailwind.css` — the shared token partial, not a standalone entry: tokens (`:root` / `.dark` / P3), the
  `@theme inline` bridge, the `sidebar` variant, Shiki colors, the theme-wipe transition. No `@import 'tailwindcss'`, no
  product `@source`.
- `typeset.css` — reusable content typography; `.typeset` precedes `.typeset-post` / `.typeset-comment` at the same
  specificity — source order is contractual. Editor text-decorative lengths use EM for canvas-zoom compatibility.

## Design tokens

- Every custom property behind a utility is declared in `@theme inline` in `tailwind.css` AND registered in
  `packages/web/ui/src/lib/cn.ts`, which extends every project token namespace so custom `--text-*` / `--color-*` /
  `--shadow-*` tokens land in the correct merge group (`packages/web/ui/tests/unit/contract/tailwind-tokens.test.ts`).
- No arbitrary-value syntax for design-system or size tokens — declare a named token and its merge group instead.
- Never write `dark:bg-foo` on a tier-1 token — the `.dark` rebind handles the switch. Adjacent dark surface tiers stay
  3–8 L apart; no `--line-*` token shares a value with a `--surface-*` token.

## Border roles

`border-border` for containers, cards, dividers; `border-line-muted` for control outlines. Never `border-input`,
`border-line`, or `border-ga-300` as resting control colors.

## Locale font chains

`tailwind.css` owns the default `--font-body` / `--font-serif` chains: zh-CN at `:root`, `:lang(en-US)` / `:lang(zh-TW)`
/ `:lang(zh-HK)` overrides — keep them in lockstep with `DEFAULT_FONT_STACKS` in
`packages/web/ui/src/lib/font-stacks.ts`, the map the document shell's head planner appends to the configured font
stacks (`components/document-shell/document-head.ts`).

## Shadow tiers

`shadow-card` (public content cards), `shadow-raised` (admin cards/stat tiles), `shadow-popover` (menus), `shadow-modal`
(dialogs/sheets). Do not mix card and raised silhouettes in one view.
