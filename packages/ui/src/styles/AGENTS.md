# UI style conventions

`packages/ui/src/styles/` contains only host-agnostic design-system partials. Product compilation entries and `@source` graphs belong to the consuming app; Inkling host chrome belongs to `@kobato/web`.

## Generic styles

- `ui.css` is the design system's own compilation entry. It emits tokens/typeset and scans only `components/`, `icons/`, and `lib/`. Consumers import it directly instead of scanning UI from their own entries.

- `dark-variant.css` — the single `dark` variant: `.dark` class, or `prefers-color-scheme` when no class is set. Import it unlayered before any utility compile; `@custom-variant` is rejected inside a cascade layer. The Inkling demo uses `@kobato/inkling/styles/variants.css` with deliberately distinct semantics.
- `tailwind.css` — shared token partial, not a standalone entry: design tokens (`:root` / `.dark` / `prefers-color-scheme` / P3), the `@theme inline` bridge, the `sidebar` variant, base overrides, Shiki token colors, and the theme-wipe transition. It has no `@import 'tailwindcss'` or product `@source`.
- `typeset.css` — all reusable content typography. `.typeset` base rules precede `.typeset-post` and `.typeset-comment`; all three sit at the same specificity, so source order is contractual. Editor text-decorative lengths use EM for canvas zoom compatibility.

## Design tokens

- Every custom property behind a utility must be declared in `@theme inline` in `tailwind.css` and registered in `packages/ui/src/lib/cn.ts`; `packages/ui/tests/contract/tailwind-tokens.test.ts` enforces the pair.
- No arbitrary-value syntax for design-system or size tokens. Declare a named `@theme inline` token and register its merge group instead.
- Never write `dark:bg-foo` on a tier-1 token — the `.dark` rebind handles the switch. Adjacent dark surface tiers stay 3–8 L apart, and no `--line-*` token shares a value with a `--surface-*` token.

## Border roles

`border-border` for containers, cards and dividers; `border-line-muted` for control outlines. Keep primary, destructive, selected and focus borders semantic. Do not introduce `border-input`, `border-line` or `border-ga-300` as resting control colors.

## Locale font chains

`tailwind.css` owns the default `--font-body` / `--font-serif` chains: zh-CN at `:root`, with `:lang(en-US)` / `:lang(zh-TW)` / `:lang(zh-HK)` overrides. The app root may prepend configured families to the same locale tail. Keep the CSS branches in lockstep with `DEFAULT_FONT_STACKS` in `packages/ui/src/lib/font-stacks.ts`.

## Shadow tiers

`shadow-card` for public content cards, `shadow-raised` for admin cards/stat tiles, `shadow-popover` for menus/popovers, and `shadow-modal` for dialogs/sheets. Do not mix card and raised silhouettes in one view.

`packages/ui/tests/contract/style-ownership.test.ts` forbids product imports, product scan graphs, and additional product styles in this directory.
