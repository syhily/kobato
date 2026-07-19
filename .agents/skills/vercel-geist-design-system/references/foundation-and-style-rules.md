## Foundation Gate

For any task that creates or materially changes rendered UI, complete the Geist
foundation layer before screen design or screen implementation. For tiny
primitive-only fixes, verify the touched primitive still composes the same
foundation. Do not design or implement individual screens until the relevant
foundation inventory is present, wired through the real app entrypoints, and used
by shared primitives.

Record pass/fail status for: official docs opened, `design.md`/dark token
source consulted as applicable, fonts, semantic tokens, typography utilities,
spacing/rounded tokens, materials/elevation, focus rings, app shell, component
primitives, state system, and screen composition. The implementation details for
that inventory live in the dedicated sections below, especially `App-Wide Setup`;
do not duplicate them in screen files or bypass them with local styles.

## Canonical Token Source

Use `https://vercel.com/design.md` as the current official compact source for
Geist light-theme tokens and defaults. It includes colors, typography, spacing,
rounded values, button/input defaults, layout rhythm, elevation, motion, focus,
and voice/content rules. Use `https://vercel.com/design.dark.md` for dark mode
or theme switching. These documents are marked alpha, so never rely on cached
values when strict/docs-verified Geist is claimed; open the current document in
the current turn and map project tokens from it first. Use bundled snapshots
`vercel-design.md` and `vercel-design-dark.md` only for local exact lookup or
blocked-doc fallback. Older Geist Introduction, Colors, Typography, and
Materials pages are conditional supplements: open them when the user asks for
that page's detail, `design.md` lacks a needed detail, or a component/page
decision depends on them.

## Geist Essence

The target feel is a restrained developer-tool interface:

- Neutral-first, high-contrast, accessible surfaces.
- Typography and spacing do most of the hierarchy work.
- Color is functional: status, focus, selection, destructive state, success, warning, links, sparse brand accents, and the single most important action when supported by current `design.md` plus component evidence.
- Layouts are orderly, dense where useful, and easy to scan repeatedly.
- Borders are hairline structure, not decoration.
- Motion is short, subtle, and state-driven.
- Empty space is intentional, not a substitute for missing product thinking.
- Copy is concrete and operational. Avoid marketing fluff inside product UI.

## Reference Archetype Selection

Vercel style is an ecosystem, not only the `vercel.com` homepage. Before
designing, classify the requested surface and choose matching current
Vercel/Geist references:

- Homepage, launch, hero, or broad marketing composition: the Vercel homepage
  may be a primary composition reference.
- Product landing, pricing, docs, dashboard, settings, form, table/list,
  portfolio, app shell, or component-library work: inspect comparable
  Vercel/Geist surfaces and mapped Geist components instead of defaulting to
  homepage composition.

When a comparable Vercel surface is available, inspect its container width,
section rhythm, density, typography scale, grid spans, interaction states, and
responsive behavior. Do not copy one product screen wholesale, and do not force
homepage-specific patterns such as oversized heroes, announcement strips, or
visible guide art onto product surfaces where they do not fit.

## Layout Rules

- Product apps should open directly into the usable workspace, not a marketing landing page.
- Dashboards should favor a clear primary workflow, quiet secondary controls, and compact information density.
- Existing app shells should keep one canonical navigation/footer/contact model. If a sticky or primary navigation already owns section links, do not duplicate the same link set in the footer. If a contact section already owns contact actions, do not repeat the same contact/social list in the footer unless the user explicitly asks for redundant footer navigation.
- Use full-width page bands or unframed layouts for sections. Do not put page sections inside decorative cards.
- Cards are for repeated items, modals, individual panels, and genuine framed tools. Do not nest cards inside cards.
- Use a predictable grid and stable dimensions for toolbars, boards, tables, counters, and repeated tiles.
- Treat "grid" as layout first for ordinary responsive UI: use CSS grid/flex,
  columns, rows, gutters, borders, cells, spacing, and stable responsive spans
  to organize content. This is encouraged. Treat decorative visible grid
  backgrounds as opt-in only: do not add graph-paper lines, blueprint lines,
  guide lines behind copy, or repeating-gradient backgrounds because the task
  says grid layout, dashboard grid, feature grid, Vercel style, or because the
  agent picked a Vercel reference that contains grid art. Add visible
  guide/cell/grid background art only when the user explicitly asks for it, a
  user-supplied design clearly shows it, or the requested surface is the
  official Geist Grid component. Scope it to that surface, make it a real
  content grid with aligned cells, and keep page bodies, app shells, ordinary
  panels, cards, tables, lists, credential sections, and contact cells on solid
  backgrounds. Full-page visible grid backgrounds require an explicit full-page
  request.
- Use the official `design.md` spacing scale first: 4, 8, 12, 16, 24, 32, 40, 64, and 96px. Preserve its compact rhythm: tight spacing inside groups, moderate spacing between groups, and larger spacing between sections. If project tokens exist, map them to this scale before inventing new spacing.
- Center reading/product surfaces in a sensible max-width, using the current `design.md` layout guidance as the default reference for max width, gutters, and breakpoints.
- Do not let hover, loading, selected, or error states resize components or shift layout.
- Tables and logs should use tight rows, clear column alignment, sticky headers when useful, and monospaced numerals/IDs.
- Verify layout at mobile, laptop, desktop, and ultra-wide viewport widths. Zooming out may supplement visual review, but it is never a substitute for recorded ultra-wide viewport screenshot evidence when Browser or Playwright can set the viewport.
- Respect safe-area insets with `env(safe-area-inset-*)` for fixed headers, bottom bars, drawers, sheets, and full-screen surfaces.
- Test with scrollbars always visible when possible. Fix unwanted horizontal or nested scrollbars; only render scrollbars that serve an intentional workflow.
- Prefer flex/grid/intrinsic CSS layout over JavaScript measurement. Avoid layout thrash by letting CSS handle flow, wrapping, and alignment.
- Align deliberately to a grid, baseline, edge, or optical center. Allow deliberate +/-1px optical alignment when perception beats geometry, and balance text/icon lockups for contrast, weight, size, and spacing.

## Color Rules

Follow the current `design.md` color model:

- `background-100`: primary page/card surface.
- `background-200`: secondary surface for subtle separation, not a general fill.
- Non-background color scales run `100` through `1000`; use lower steps for backgrounds, middle steps for borders and fills, and upper steps for secondary/primary text and icons according to the current document.
- Use `gray-alpha-*` for translucent borders, dividers, overlays, and hover states; use solid `gray-*` for text and opaque fills.
- Accent scales are semantic only. Follow the current `design.md` meaning for blue, red, amber, green, teal, purple, and pink; do not use accents decoratively.

Implementation guidance:

- When defining custom CSS/Tailwind tokens, prefer raw `design.md` token names first: `background-*`, `gray-*`, `gray-alpha-*`, and each used accent scale. If the project already exposes official Geist/Core tokens or generated CSS variables, map semantic aliases to those without duplicating the raw layer. Semantic names are local aliases, not Geist source tokens.
- Use current `design.md` and Colors page values for surfaces, borders, fills, text, icons, focus, and status; do not choose arbitrary near-neutral values unless mapping an existing project token to those official roles.
- In dark mode, map to `design.dark.md` token names rather than inventing a separate near-black palette.
- Use alpha grays for subtle hover/focus layers when the project token system supports them.
- Status colors are allowed only for semantic status, links, focus, selection, documented product meaning, or the single most important action when supported by current `design.md` plus Button/component evidence. Map each meaning to the current `design.md` accent guidance instead of older assumptions. `accent` must alias a specific official Geist role or scale for focus, selection, link, status, or that supported primary action; default/primary actions must follow `design.md` plus the consulted Button/component page rather than a broad decorative accent token. Never create decorative accent colors.
- For charts and status-heavy views, use redundant cues such as labels, shape, texture, icon, or position alongside color. Use color-blind-friendly palettes and verify contrast with APCA where available.
- Hover, active, and focus states should increase contrast over the rest state instead of becoming softer or less legible.
- Do not build a one-note purple/blue gradient interface.
- Do not use decorative gradient orbs, bokeh blobs, glassy rainbow panels, or loud shadows.
- Do not make color carry meaning alone; pair it with text, icon, shape, or state.

## Typography Rules

Use the full Geist type family when available:

- Geist Sans: headings, body text, navigation, buttons, forms, tables, dialogs.
- Geist Mono: code, data, tabular figures, command text, shortcuts, IDs, versions, environment variables, commit hashes, terminal/log output, inline technical tokens, and numeric alignment when official `*-mono` tokens or the consulted component context fit. Use Sans label/copy utilities with `tabular-nums` for ordinary numeric UI where the current docs or project primitive map that context to Sans. Never use Mono for prose.
- Geist Pixel: local restraint, not Vercel Font source-of-truth usage guidance. Use it sparingly for one intentional display/brand moment such as a wordmark, small campaign lockup, highly constrained hero accent, banner accent, or constrained dashboard/product accent. Never use it for body copy, dense tables, forms, settings copy, navigation, long headings, metric grids, or ordinary dashboard/product text unless current official Pixel or Font guidance explicitly supports that exact use.
- In Next.js with the `geist` package, import Pixel variants from `geist/font/pixel`: `GeistPixelSquare`, `GeistPixelGrid`, `GeistPixelCircle`, `GeistPixelTriangle`, and `GeistPixelLine`.

Use the official Geist type categories:

- Headings introduce pages or sections.
- Buttons use button-specific text styles only inside button components.
- Labels are single-line UI text with generous enough line-height to align with icons.
- Copy is for multiline text.

Use official Geist Tailwind typography classes first. If the project lacks these classes, add or map them through the project's Tailwind/theme/CSS token layer before building new UI. Raw font-size, line-height, letter-spacing, and font-weight values may appear only inside named Geist typography utility definitions, using `design.md`, installed Geist/Core CSS values, or computed official class values gathered during the current docs pass.

The following typography names are implementation mappings only. They do not satisfy the docs gate and must not be used as proof unless the official Typography page was opened, read, and influenced the implementation in the current turn.

- Headings: `text-heading-72`, `text-heading-64`, `text-heading-56`, `text-heading-48`, `text-heading-40`, `text-heading-32`, `text-heading-24`, `text-heading-20`, `text-heading-16`, `text-heading-14`.
- Buttons: `text-button-16`, `text-button-14`, `text-button-12`. Use these only inside button components.
- Labels: `text-label-20`, `text-label-18`, `text-label-16`, `text-label-14`, `text-label-14-mono`, `text-label-13`, `text-label-13-mono`, `text-label-12`, `text-label-12-mono`.
- Copy: `text-copy-24`, `text-copy-20`, `text-copy-18`, `text-copy-16`, `text-copy-14`, `text-copy-13`, `text-copy-13-mono`.
- Use descendant `<strong>` inside a Geist typography class for Strong treatment.
- Use Subtle modifiers only through the project's official Geist class/token implementation. Do not fake subtle text by making it unreadably gray.
- Use `tabular-nums` for metrics, timestamps, table numbers, counters, and numeric label/copy styles. Use Geist Mono for code, data, tabular figures, official mono classes, or technical content when the current docs or mapped component context supports it.

Usage mapping guidance after current docs evidence:

- `text-heading-72`: rare top-level page, launch, or hero display moments when the official typography evidence or existing Geist mapping supports that scale.
- `text-heading-32`: major section headings when hierarchy requires it; do not use heading tokens for ordinary paragraphs.
- `text-button-14`: default button text.
- `text-button-12`: tiny button inside an input field.
- `text-label-14`: most common label/menu text style.
- `text-label-13`: secondary line next to labels; use tabular alignment when conveying numbers.
- `text-label-12`: tertiary text in busy views, Show More, comments, and calendar capitals.
- `text-copy-16`: simpler larger views such as modals.
- `text-copy-14`: most common copy style.
- `text-copy-13`: secondary copy or dense views.
- `text-copy-13-mono`: inline code mentions.

Fallback when official classes are absent:

- Define named `text-heading-*`, `text-button-*`, `text-label-*`, and `text-copy-*` mapped equivalents before writing screen styles.
- The mapped equivalents must preserve the official category, size, line-height, letter-spacing, and weight relationships from the Typography page, installed Geist/Core CSS, or computed values from the current official docs pass.
- Raw sizes are allowed only inside those shared typography utility definitions. Route, page, screen, and feature files must consume the named utilities and must not use broad ad hoc heading/body/button size ranges as proof of Geist typography.

Typography constraints:

- Do not default an entire interface to `text-base`.
- Do not make every heading bold. Prefer medium/semi-bold and hierarchy through size, spacing, and placement.
- Do not invent global negative tracking. Preserve the official `design.md` letter-spacing values inside mapped heading utilities, including smaller heading tokens, and keep body/copy tracking at the documented defaults.
- Keep long-form prose readable; do not use Geist Mono for paragraphs.

## App-Wide Setup

This section is an implementation checklist for the mandatory Foundation Gate; it cannot narrow, delay, or exempt any Foundation Gate requirement.

For any task that creates or materially changes rendered UI, create or verify the shared Geist foundation before styling individual screens, routes, pages, or feature components.

- Fonts: use Geist Sans and Geist Mono through the host project's font setup. In Next.js, prefer the `geist` package with `geist/font/sans` and `geist/font/mono`; add `geist/font/pixel` only when a constrained display/brand accent is actually used.
- Root layout: apply Geist Sans as the default UI font, expose Geist Mono for code, data, tabular figures, command text, shortcuts, technical identifiers, versions, environment variables, commit hashes, terminal/log output, and official mono classes, and expose Geist Pixel variables only for constrained display accents. Numeric product data should use the current docs or mapped component context to choose between Sans plus `tabular-nums` and official mono typography.
- Typography: define or map the official `text-heading-*`, `text-button-*`, `text-label-*`, and `text-copy-*` classes. New components and screens must use these classes or mapped equivalents; raw `text-sm`, `font-bold`, arbitrary line-height, and arbitrary tracking are allowed only inside shared token/utility definitions or inside third-party/generated code that cannot consume project utilities. The final response must name the file, constraint, and why a mapped utility was impossible.
- Spacing and rounded: define or map the current `design.md` spacing scale and `rounded.sm`, `rounded.md`, `rounded.lg`, and `rounded.full` before screen work. Screen files should consume named tokens/classes instead of one-off spacing/radius values.
- Colors: define semantic tokens for `background`, `foreground`, `muted-foreground`, `border`, `ring`, `accent`, `link`, `info`, `destructive`, `success`, and `warning`, mapped to `design.md` light tokens and `design.dark.md` dark tokens when dark mode is in scope. Components should consume semantic tokens, not hard-coded grays.
- Materials: use existing official Geist/Core material presets when the project has them. Otherwise, when material helpers are useful, define local aliases such as `material-base`, `material-small`, `material-medium`, `material-large`, `material-tooltip`, `material-menu`, `material-modal`, and `material-fullscreen` only as implementation mappings to current `design.md` rounded, surface, and elevation guidance plus any consulted Materials/component page evidence. Do not treat those alias names as official `design.md` tokens.
- Primitives: create or adapt shared primitives for Button/IconButton, Input/Textarea, Select/Combobox when needed, Checkbox/Radio/Switch, Tabs, Modal/Sheet/Drawer, Menu/Tooltip, Toast/Feedback, Table/List, Empty/Error/Loading/Skeleton states, Surface/Material, and AppShell before composing multiple screens. App shells, panels, and surfaces use CSS grid/flex plus Geist tokens/materials by default. Consult Geist Grid only when the user explicitly asks for visible guide/cell layout, a user-supplied design clearly includes it, or the Grid component itself is the intended UI surface. Scope visible guide backgrounds to that exact surface; do not apply them to ordinary panels, page bodies, app shells, or unrelated content grids. Panels/surfaces still inherit Context Card, Relative Time Card, Project Banner, Entity, Description, or Table Best Practices as applicable to the content.
- Borders and focus: define one shared focus-visible utility/variant using the current `design.md` focus-ring default or an exact project token mapping to it, then verify focus behavior separately through the Vercel Web Interface Guidelines accessibility checks. Wire that utility into every interactive primitive and prohibit screen-local outline, box-shadow, or ring definitions.
- App shell: use Geist foundations and Vercel Web Interface Guidelines for root background, content gutters, header/sidebar/navigation structure when needed, restrained dividers, predictable max-width behavior, mobile behavior, one obvious primary action zone per view, skip-to-content, valid heading hierarchy, and context-specific `<title>`.
- State system: provide consistent hover, active/pressed, selected/current, disabled, loading, empty, error, validation, focus-visible, and reduced-motion states across the app.
- Dark mode: support dark mode only when the app already has it or the user asks for it; if implemented, map the same Geist roles rather than inventing a second palette.
- Existing projects: adapt to the existing architecture and component library, but route all new styling through Geist tokens and classes. This adaptation cannot bypass the Foundation Gate.

## Materials Rules

The following material names are local implementation mappings only. Current `design.md` describes surfaces, rounded shapes, and elevation categories; it does not make these alias names official tokens. These aliases do not satisfy the docs gate and must not be used as proof unless `design.md` plus the official Materials page were opened, read, and influenced the implementation in the current turn.

Use official Geist Material presets first when the project has them. Otherwise map local material aliases to documented radii, fills, strokes, and shadows.

Surface materials sit on the page:

- `material-base`: everyday surface. Radius 6px.
- `material-small`: slightly raised surface. Radius 6px.
- `material-medium`: further raised surface. Radius 12px.
- `material-large`: further raised surface. Radius 12px.

Floating materials sit above the page:

- `material-tooltip`: lightest shadow. Corner 6px. Add a triangular stem only when current official Tooltip/Materials evidence explicitly requires it.
- `material-menu`: lifted menu surface. Radius 12px.
- `material-modal`: further lifted modal surface. Radius 12px.
- `material-fullscreen`: biggest lift. Radius 16px.

Material constraints:

- Do not invent larger radii for a softer look. Existing token names may differ only if their resolved values preserve the current `design.md` rounded scale and Materials page radii for the mapped preset; otherwise strict Geist compliance is blocked.
- Do not use heavy decorative shadows. Elevation should clarify layering, not create a floating-card aesthetic.
- Use the component-specific material level: menus get menu material, modals get modal material, and ordinary page cards/panels use base/small/medium/large surface materials.
- Do not nest multiple elevated materials unless the interaction genuinely requires layered floating UI.

## Vercel Design Details

Apply the Design section of `https://vercel.com/design/guidelines` when the UI uses shadows, borders, nested containers, non-neutral surfaces, text transforms, charts, masks, fades, or browser chrome:

- If shadows are used, layer ambient and direct-light shadows and pair them with crisp borders for edge clarity.
- Nested radii must be concentric: child radius is less than or equal to parent radius and curves align.
- On non-neutral backgrounds, tint borders, shadows, and text toward the same hue instead of mixing arbitrary hues.
- Avoid scaling text nodes directly; animate a wrapper instead, and use GPU promotion only when text anti-aliasing artifacts persist.
- Avoid gradient banding in masks and fades, especially when fading content to dark colors.
- Charts must use color-blind-friendly palettes, and contrast should be checked with APCA where available.

## Implementation Rules

- Use existing project tokens and primitives only after mapping or adapting them to the required Geist foundation roles. If they cannot express Geist fonts, tokens, typography utilities, materials/radii, focus rings, states, and app shell composition, establish those shared layers first.
- If tokens are missing, define a small semantic token layer in CSS variables before styling components.
- Keep component APIs explicit and small. Avoid boolean prop proliferation; use explicit variants or composition.
- Do not add mock/sample data to make UI look filled. Use real data pathways or honest empty/loading states.

## Tailwind Guidance

Use Tailwind through the host project's setup only.

- When defining custom CSS/Tailwind variables, prefer raw `design.md` token roles first, then derive semantic aliases such as `background`, `foreground`, `muted-foreground`, `border`, `ring`, `link`, `info`, `destructive`, `success`, and `warning`. If the project already exposes official Geist/Core tokens or generated CSS variables, map semantic aliases to those without duplicating the raw layer. If an `accent` alias exists, it must resolve to a specific official Geist role/scale for focus, selection, link, status, or the single most important action when supported by current `design.md` plus Button/component evidence, never to a decorative palette.
- Keep class lists readable and consistent with existing project conventions.
- Prefer semantic component classes or variants for repeated patterns.
- Arbitrary color, typography, radius, shadow, focus, ring, material, and state values may appear only inside shared token, utility, variant, or primitive definitions. Route, page, screen, and feature files must consume named tokens, utilities, variants, or primitives instead of one-off arbitrary values.
