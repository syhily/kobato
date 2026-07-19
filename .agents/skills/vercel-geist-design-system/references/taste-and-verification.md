## Anti-Patterns And Failure Modes

Geist is a restraint-first production style. When this skill conflicts with generic `frontend-design` guidance, this section wins. Do not apply instructions to be bold, unforgettable, maximal, experimental, surprising, ornamental, or visually striking unless the user explicitly asks for that and confirms it should override Geist. For Vercel/Geist work, differentiation comes from product clarity, precise typography, consistent tokens, and real workflow polish.

This section separates official-source checks from local Vercel/Geist taste heuristics. Official-source checks are enforceable only through the cited Geist foundation/component/brand pages or Web Interface Guidelines and can support `Docs Evidence`. Local taste heuristics are red flags for generic SaaS or template output; they do not satisfy `Docs Evidence` by themselves and must lead back to official docs before making strict Geist claims.

Reject or revise these failure modes before finishing:

- Local heuristic: generic AI SaaS visual language such as giant "accelerate/build/automate" heroes, gradient headlines, glowing blobs/orbs, glass panels, noise overlays, floating feature pills, and fake customer/logo bands.
- Local heuristic: decorative gradients, purple-blue sweeps, rainbow meshes, radial glow backgrounds, bokeh, aurora effects, spotlight blobs, or background effects that are not required by product meaning. Preserve user-approved, brand-defining effects and restyle their boundaries, contrast, performance, or reduced-motion behavior before deleting them. Official check: any retained color/motion/material treatment must be justified by current `design.md` plus any triggered component, Materials, animation, or content evidence.
- Local heuristic: visible guide-line grids, cell guides, grid-art
  backgrounds, graph-paper lines, blueprint lines, and repeating-gradient grid
  backgrounds are failures by default. They are allowed only when the user
  explicitly asks for visible grid art/backgrounds/cell guides, a user-supplied
  design clearly contains them, or the requested UI surface is the official
  Geist Grid component. In those cases, identify the exact visible-grid surface
  first, keep the rest of the page on solid Geist backgrounds, and verify the
  lines are intentional content surfaces with aligned cells, borders,
  clipping/solid cells where useful, and responsive row/column behavior.
- Official-source check: arbitrary accent colors, multi-hue dashboards, invented dark-mode palettes, or colors chosen for mood rather than official color roles and semantic product meaning violate current `design.md`/`design.dark.md` or triggered Colors evidence.
- Local restraint, not `Docs Evidence`: non-Geist typography such as expressive display fonts, font pairing experiments, Inter/Roboto/Space Grotesk swaps, global system-font fallbacks used as a design choice, or Geist Pixel outside a constrained display accent.
- Official-source check: reject radii that violate current `design.md` shapes or the consulted Materials/component page. Component-specific rounded/pill variants are allowed only when the relevant official component page documents them and the usage matches that context.
- Official-source check: composition fails only when page sections, cards inside cards, metric/list/form blocks, or app shell panels violate current `design.md`, triggered Material/component, layout, or guideline evidence. Local heuristic: card-first or card-in-card template composition is a red flag unless tied back to official docs and user scope before strict claims.
- Local heuristic: fake product substance such as mock/sample data, fake charts, fake users, fake notifications, imaginary integrations, placeholder metrics, or seeded examples used to make the UI look busy. Use the real data path, honest empty/loading/error states, or clearly user-provided content.
- Local heuristic: marketing instead of workflow, including landing pages where an app should start, oversized hero before the usable surface, vague value props in operational screens, or "AI-powered" copy that does not describe a concrete capability. Confirm through the user's scope and Content evidence before treating it as a strict failure.
- Official-source check: animation must clarify cause/effect or add deliberate delight, respect reduced motion, avoid `transition: all`, stay interruptible/input-driven, and use CSS/compositor-friendly properties when possible. Local heuristic: avoid scroll reveals, parallax, bounce, animated gradients, cursor effects, celebratory effects, or hover surprises in ordinary product surfaces unless the user explicitly asks and official motion checks still pass.
- Local heuristic: layout spectacle such as asymmetry, overlap, diagonals, broken grids, oversized negative space, or edge-to-edge compositions that reduce scan speed in product UI.
- Local heuristic: confusing "Grid" the component with CSS grid layout is a
  design failure. CSS grid/flex layout, gutters, rows, columns, bordered cells,
  and aligned responsive spans are good; visible grid backgrounds are not the
  default Vercel look. If the user did not explicitly ask for visible grid
  backgrounds/cell guides and did not provide a design showing them, remove
  grid decoration behind ordinary hero copy, product cards, tables, credential
  lists, contact cells, app shells, and page bodies while keeping functional
  rows, columns, borders, solid backgrounds, and alignment.
- Local heuristic: control overload where toolbars and sidebars expose many actions before the primary workflow is obvious; group or defer advanced controls and verify with interaction/content evidence.
- Official-source check: low-contrast softness such as gray-on-gray text, subtle borders that disappear, muted controls without visible affordance, or hierarchy that relies on opacity alone violates current `design.md`, triggered Colors, Design, or Accessibility evidence.
- Official-source check: inconsistent primitives such as one-off colors, radii, typography classes, shadows, button sizes, focus rings, or state styles fail when they bypass consulted Geist foundations/components.
- Official-source check: brand misuse, including Vercel/Next/Turbo/v0 logos or wording that implies endorsement, affiliation, or product identity when the app is not actually that brand, violates Geist Brands evidence.

Failure handling:

- If a design starts to look like a generic AI startup template, stop and simplify: remove decorative background effects that are not user-approved brand moments, collapse competing CTAs without inventing replacement actions, reduce color to neutral plus semantic status, and put the real workflow in the first viewport.
- If the design starts to look like accidental graph paper, blueprint UI, or a
  canvas editor, remove the grid background unless the user explicitly requested
  visible grid art/backgrounds/cell guides or supplied a design showing them.
  Preserve the functional grid layout and use normal cells, tables, lists,
  panels, spacing, solid surfaces, and borders. When visible guides are
  explicitly required, refine them only on that requested surface into an
  intentional Geist/Grid-style treatment with real content cells.
- If the result depends on fake data to look complete, do not ship it. Wire real data, show an honest empty state, or ask the user for real content.
- If the existing project has a different visual system and the user has not made it the final visual authority, migrate or adapt the whole touched app or requested surface to Geist through shared tokens and primitives. State a blocker only when an explicit non-Geist authority or hard scope constraint makes coherent whole-surface Geist migration impossible.
- If the user asks for "more creative" without explicitly overriding Geist, increase polish through alignment, density, copy, state coverage, and interaction clarity, not through gradients, ornamental assets, or random colors.

## Vercel Taste Gate

This is a mandatory visual quality gate for any frontend task using this skill. The work is not done until evidence shows the app or verified scope passes a Vercel/Geist audit. Do not finish from code inspection alone when a local app can run.

Required audit loop when the app/code can be exercised; capture screenshots whenever a local page can run:

1. Run the local app or page through the project's normal development command and record the command plus URL.
2. Perform Scope Discovery before screenshots: inspect framework route files/config, navigation/link usage, sitemap or build route output when available, and real app entrypoints. Include Storybook/examples only when they are real app surfaces. Record inaccessible, auth-gated, environment-gated, or dynamic routes with concrete blocker reasons. Create a route/surface/state inventory before screenshots: `route/surface | discovery source | required states | mobile screenshot | laptop screenshot | desktop screenshot | ultra-wide screenshot | interaction audit | status`. For greenfield/full redesign/broad polish work, every discovered routable surface and required shared state must appear in the inventory; whole-app claims fail if any row is missing or incomplete.
3. If the app runs, attempt Browser or Playwright mobile, laptop, desktop, and ultra-wide screenshots for each inventory row. Include the first viewport and any changed states such as menus, dialogs, empty states, loading states, errors, or dense data views. Record the command, URL, viewport sizes, screenshot paths, and state. Valid screenshot blockers are limited to app cannot build/run, missing auth or environment values, browser/screenshot tool unavailable after a named attempt, or route unreachable after the discovery source was checked. If screenshots are possible and not captured, do not claim the Vercel Taste Gate passed.
4. Run an interaction audit for every changed flow using an applicability matrix: `check | pass/fail/N/A | reason/evidence`. Cover keyboard-only operation, visible `:focus-visible`/`:focus-within`, overlay initial/trapped/restored focus, Escape/Enter/Cmd/Ctrl+Enter behavior, label activation, desktop >=24px and mobile >=44px targets, URL state plus Back/Forward/refresh/scroll restoration, optimistic update rollback/Undo, tooltip timing, intentional `overscroll-behavior`, clean drag behavior, locale-aware shortcuts, browser `theme-color`/`color-scheme`, and accessibility tree names/states/hidden decoration. Applicability triggers are mandatory: overlays require focus checks; mutations require optimistic/rollback or explicit non-applicability; tooltips require timing checks when present; filters, tabs, search, pagination, expanded panels, selected views, and any visible workflow state require URL-state checks; drag/reorder features require drag checks; icon-only controls require accessibility-tree verification. Conditional checks may be `N/A` only with a specific reason tied to absent UI/behavior. Revise failures before judging screenshots.
5. Compare the rendered UI against Geist foundations and relevant Geist components from the official reference map.
6. Deterministically check for the official Web Interface Guidelines review path. In Codex, use an installed command, slash command, or accessible helper only if the current agent actually supports it and a concrete documented invocation is present. Otherwise, read `https://vercel.com/design/guidelines` directly and run the manual checklist below from the current official page. Record the exact command/helper/page/checklist used. Run installers only with explicit user or project opt-in and record the reason. Helper prompts may route or run an audit helper; they cannot supply design-system authority, cannot satisfy `Docs Evidence`, and cannot replace reading `https://vercel.com/design/guidelines` in the current turn. If no helper can be run, record the blocker and continue with the manual checklist.
7. Identify every place where the UI fails the evidence-backed pass criteria or trips local generic-SaaS heuristics.
8. Revise the implementation, then inspect fresh screenshots and rerun the interaction audit.
9. Repeat until the screenshots and interaction audit pass every rule below.

Pass criteria:

Manual Web Interface Guidelines checklist when no helper can run:

`guideline area | official page section | exact quote/paraphrased evidence | affected surface | check performed | pass/fail/N/A | revision`

- Accessibility and keyboard: focus visibility, focus order, labels, target size,
  mobile input size, browser zoom, accessibility-tree names, and hidden
  decoration.
- State and navigation: URL-persisted workflow state, Back/Forward/refresh
  restoration, scroll restoration, optimistic mutation behavior, error recovery,
  and no dead-end screens.
- Interaction details: tooltip timing, modal/drawer scroll containment,
  drag/reorder behavior, shortcut localization, label activation, and tap
  behavior.
- Browser and visual details: theme-color/color-scheme, shadows, borders,
  nested radii, non-neutral backgrounds, text transforms, charts, masks, fades,
  and browser chrome.

- Route/surface/state inventory is complete for the verified scope, with discovery source plus mobile, laptop, desktop, and ultra-wide screenshot evidence or valid recorded blockers for every row.
- The chosen Vercel/Geist reference archetype matches the requested surface; homepage-specific composition is used only for homepage, hero, launch, or broad marketing work, and product/docs/dashboard/form/table surfaces are checked against comparable Geist components or Vercel surfaces when available.
- Foundation evidence is visible in implementation: current `design.md` token/default usage, `design.dark.md` usage when dark mode is in scope, Geist Sans/Mono usage, Geist Pixel only when a constrained display accent is intentionally used and otherwise verified absent, Colors roles, Typography utilities, spacing/rounded tokens, Materials/elevation, focus rings, app shell, and shared state primitives are mapped in real files and used by changed screens.
- Component evidence is visible in implementation: every UI pattern that maps to Geist has a matching component page, exact section/quote evidence, applicable Best Practices when present, and changed code that follows the documented behavior/content/accessibility rule.
- Web Interface Guidelines evidence is complete: interaction applicability matrix has pass/fail/N/A plus reasons, and failures were revised or explicitly blocked.
- Screenshots show the real product/workflow in the first viewport for every verified route/surface, not a generic landing page unless the user explicitly requested marketing.
- Screenshots and code show one coherent system: shared tokens/classes/materials/primitives are reused, and there are no isolated Geist-looking components inside unrelated styling.
- Existing content, IA, routes, CTAs, brand-defining effects, credential semantics, credential-specific artwork and asset provenance, contact ownership, and footer/navigation ownership were preserved unless the final report names a user request or concrete issue that required changing them.
- Typography uses the mapped Geist categories/utilities from `design.md` or official Typography evidence and does not rely on giant generic headlines, all-bold headings, or default `text-base` everywhere.
- Color uses `design.md`/`design.dark.md` roles or mapped project tokens; accents appear only for brand, links, selection, status, focus, or the single most important action when supported by current `design.md` plus Button/component evidence.
- Materials, elevation, and radii follow `design.md` plus consulted Materials/component evidence; depth is structural and does not rely on loud shadows, glass panels, or decorative background effects.
- Mobile, laptop, desktop, and ultra-wide screenshots preserve layout integrity: no clipped text, overlapping controls, broken grids, unwanted scrollbars, or oversized card stacks.
- Generic SaaS heuristic diff is recorded: any template-like, ornamental, overly soft, overly colorful, or disconnected areas were identified and revised, or explicitly tied to both official docs and user scope before any strict/Vercel Taste Gate claim.

Official claim blockers:

Use Source-Of-Truth Gate for `Docs Evidence` blockers. Additionally, do not claim visual polish or Vercel Taste Gate passage without screenshot inspection and interaction audit when possible, and do not leave Web Interface Guidelines failures unrevised without a concrete blocker.

Local anti-template heuristics:

Use Anti-Patterns And Failure Modes above as the local anti-template checklist. These items require revision or explicit user-scope plus official-doc justification before strict claims, but they are not official Geist violations by themselves and do not satisfy `Docs Evidence`.

If the app cannot be run, screenshots cannot be captured, or interaction checks cannot be performed, say that explicitly in the final response and do not claim the Vercel Taste Gate passed. If screenshots and interaction checks are possible, the final response must include the audit evidence: dev command, URL, mobile/laptop/desktop/ultra-wide viewport sizes, screenshot paths, changed states inspected, interaction applicability matrix summary, blockers, and revision decisions made because of the audits. Use an inspection method instead of screenshot paths only when screenshot capture is blocked, and then do not claim the Vercel Taste Gate passed.

Failure response:

- If any pass criterion fails and the file is editable, make another revision.
- If the failure cannot be fixed without user input or external access, explain the exact blocker and the closest safe fallback.
- In the final response, briefly state which checks ran and whether any visual verification was blocked.

## Final Verification Checklist

Before finishing any task using this skill that creates, changes, critiques, specifies, or materially directs rendered UI, verify:

- The first viewport shows the real product/workflow, not a generic landing page unless explicitly requested.
- Existing approved behavior was preserved: hero/brand effects, CTA count and intent, route destinations, same-site blog/docs/certification links, credential-specific artwork and asset provenance, contact section ownership, and footer/navigation ownership were not removed, duplicated, or redirected without an explicit user request or concrete accessibility/performance/security/correctness reason.
- Verification scope is explicit: greenfield/full redesign/broad polish covers all routable app surfaces; narrow existing-project work covers the requested workflow and touched shared primitives, and the final response says `whole app not verified` unless every route/surface was audited.
- The Geist foundation gate was completed before screen design: `design.md` and `design.dark.md` where applicable were consulted, and fonts, tokens, typography utilities, spacing/rounded tokens, material/elevation utilities, focus rings, app shell, required component primitives, shared state system, and screen composition rules are wired through real app entrypoints, theme/Tailwind/CSS files, shared primitives, and app shell, and consumed by changed screens.
- Screen-level styles compose shared Geist foundations, primitives, and state APIs/classes; they do not introduce one-off colors, font stacks, radii, focus rings, shadows, state styles, or component behavior.
- Strict Geist work uses local Geist Sans and Geist Mono. Non-Geist font replacements are allowed only after an explicit non-Geist visual-system override, and those surfaces cannot be claimed as strict/docs-verified Geist. Geist Pixel is installed/loaded only if a display accent uses it, and it is absent from ordinary product UI text.
- Typography uses official Geist classes or mapped equivalents for headings, buttons, labels, copy, mono, and tabular numeric text.
- Color roles use current `design.md`/`design.dark.md`, official Geist/Core tokens, or custom raw Geist scale variables before semantic aliases such as `background`, `foreground`, `muted-foreground`, `border`, `ring`, `link`, `info`, `destructive`, `success`, and `warning`. Any `accent` alias resolves to a specific official Geist role/scale for focus, selection, link, status, or the single most important action when supported by current `design.md` plus Button/component evidence; default/primary actions follow `design.md` plus the consulted Button/component page.
- Chart/status palettes use redundant cues and color-blind-friendly choices, APCA contrast is checked where available, and hover/active/focus states increase contrast over rest state.
- Materials use the official 6px, 12px, and 16px radius scale or mapped project tokens.
- Every UI pattern that exists in Geist was checked against its Geist reference before custom implementation.
- Official Geist/Vercel pages required for the task are listed in a page-specific `Docs Evidence` table in the final response in all cases: consulted rows when read, blocked rows with exact tool failures when docs access fails, and the fallback label `local Geist fallback, not docs-verified` for affected surfaces.
- Relevant component pages' Best Practices were followed, not just visual styling.
- Vercel Web Interface Guidelines were applied for keyboard behavior, focus, hit targets, URL state, optimistic updates, tooltip timing, overscroll containment, clean drag behavior, locale-aware shortcuts, mobile inputs, states, copy, numerals/units, performance-relevant UI, `theme-color`, and `color-scheme`.
- The app shell, navigation, forms, tables/lists, dialogs, menus, toasts, loading, empty, error, and no-dead-end recovery paths all share the same audited Geist tokens, typography utilities, materials, primitives, state rules, root background, gutters, header/sidebar/nav structure, dividers, max-width behavior, mobile behavior, one primary action zone, skip-to-content, valid heading hierarchy, and context-specific `<title>`.
- Interactive controls have hover, active/pressed, selected/current, disabled, loading, validation, error, focus-visible, and reduced-motion states as relevant.
- Tables, lists, forms, and screens have loading, empty, error, no-results, validation, and recovery states as relevant.
- Desktop, mobile, laptop, and ultra-wide views were inspected when a local app can run; layouts do not overlap, clip text, shift unpredictably, create unwanted scrollbars, or break safe-area insets.
- Local anti-template heuristics such as generic SaaS gradients, decorative orbs, card-in-card sections, fake sample data, and unrelated visual styles are absent or revised; retained exceptions are tied to both explicit user scope and official docs, otherwise no strict/Vercel Taste Gate claim is made.
