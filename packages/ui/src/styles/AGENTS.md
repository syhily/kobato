# UI style conventions

`packages/ui/src/styles/` contains only host-agnostic design-system partials. Product compilation entries and `@source` graphs belong to the consuming app; Inkling host chrome belongs to `@kobato/web-admin`.

## Generic styles

- `ui.css` is the design system's own compilation entry (tokens/typeset; scans only `components/`, `icons/`, `lib/`). The kobato app imports it once per document, eagerly from `apps/kobato/src/root.tsx` — route-level re-imports are forbidden; other consumers import it directly.
- `dark-variant.css` — the single `dark` variant (`.dark` class, or `prefers-color-scheme` when unset); import it unlayered before any utility compile. Single-owned — partials composed into app surfaces must not re-declare it (pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`).
- `base-defaults.css` — the base-layer border default every Tailwind compile must emit after its own preflight; surface entries import it non-reference; the compile-contract suite pins the ordering.
- `tailwind.css` — the shared token partial, not a standalone entry: tokens (`:root` / `.dark` / P3), the `@theme inline` bridge, the `sidebar` variant, Shiki colors, the theme-wipe transition. No `@import 'tailwindcss'`, no product `@source`.
- `typeset.css` — reusable content typography; `.typeset` precedes `.typeset-post` / `.typeset-comment` at the same specificity — source order is contractual. Editor text-decorative lengths use EM for canvas-zoom compatibility.

## Design tokens

- Every custom property behind a utility must be declared in `@theme inline` in `tailwind.css` AND registered in `packages/ui/src/lib/cn.ts` (`packages/ui/tests/contract/tailwind-tokens.test.ts`).
- No arbitrary-value syntax for design-system or size tokens — declare a named token and its merge group instead.
- Never write `dark:bg-foo` on a tier-1 token — the `.dark` rebind handles the switch. Adjacent dark surface tiers stay 3–8 L apart; no `--line-*` token shares a value with a `--surface-*` token.

## Border roles

`border-border` for containers, cards, dividers; `border-line-muted` for control outlines. Never `border-input`, `border-line`, or `border-ga-300` as resting control colors.

## Locale font chains

`tailwind.css` owns the default `--font-body` / `--font-serif` chains: zh-CN at `:root`, `:lang(en-US)` / `:lang(zh-TW)` / `:lang(zh-HK)` overrides — keep them in lockstep with `DEFAULT_FONT_STACKS` in `packages/ui/src/lib/font-stacks.ts`.

## Shadow tiers

`shadow-card` (public content cards), `shadow-raised` (admin cards/stat tiles), `shadow-popover` (menus), `shadow-modal` (dialogs/sheets). Do not mix card and raised silhouettes in one view.

`packages/ui/tests/contract/style-ownership.test.ts` forbids product imports, product scan graphs, and additional product styles in this directory.
