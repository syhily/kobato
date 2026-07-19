---
name: vercel-geist-design-system
description: >-
  Community skill for applying the Geist design system to Vercel-inspired
  rendered frontend UI across React/Next.js/Vite/Astro/Svelte/Vue/HTML/CSS,
  Tailwind, shadcn, and Radix. Use for typography, spacing, color, materials,
  components, app shells, dashboards, forms, tables, dialogs, states, responsive
  layout, and UI polish. Community-authored, not official Vercel. Trigger for
  Geist, Vercel-style UI, or generic clean/modern/premium/polished
  SaaS/developer-product visuals when no other final visual system is requested.
  Skip non-visual work unless it materially changes rendered UI.
metadata:
  author:
    github: joe-simo
    x: "@joesimo"
    website: https://joesimo.com
  community: true
  official: false
  short-description: Unofficial Vercel Geist visual system for clean, polished SaaS/developer-product UI; skip non-visual work and explicit alternate visual systems
  sources:
    - https://vercel.com/design.md
    - https://vercel.com/design.dark.md
    - https://vercel.com/font
    - https://vercel.com/design/guidelines
    - https://vercel.com/geist/introduction
    - https://vercel.com/geist/colors
    - https://vercel.com/geist/typography
    - https://vercel.com/geist/materials
    - https://vercel.com/geist/brands
---

# Vercel Geist Design System

Use this community skill to make interfaces feel like they belong in Vercel's
Geist design system: precise, calm, high-contrast, developer-focused, and
production-ready. Official Vercel pages are the source of truth. This is not
official Vercel guidance and is not permission to copy Vercel product screens.

## Reference Loading Contract

This compact file is the operating contract. Detailed rules live in
`references/`; load only what the task needs, but never skip a required
reference because this summary seems sufficient.

- Always load `references/source-of-truth-gate.md` for triggered visual work
  before claiming Geist, strict Geist, docs-aligned Geist, source-of-truth
  alignment, or Vercel Taste Gate passage.
- Load `references/foundation-and-style-rules.md` before creating, restyling,
  redesigning, reviewing, or materially changing rendered UI.
- Load `references/official-reference-map.md` when mapping foundations,
  brand/assets, or components to official Vercel URLs.
- Load `references/vercel-design.md` when exact bundled light-theme token,
  component-default, motion, layout, focus, or voice values are needed. Load
  `references/vercel-design-dark.md` for the same dark-theme values.
- Load `references/component-system.md` before components, primitives, component
  states, custom compositions, or component-page mapping.
- Load `references/trust-brand-and-asset-rules.md` before certification/trust
  credential displays, official marks, iconography, logos, badges, or brand
  asset work.
- Load `references/motion-performance-copy-rules.md` before UI copy,
  performance-relevant UI, motion/interaction, or Web Interface Guidelines
  overlay work.
- Load `references/companion-routing.md` only when another Skills.sh entry,
  framework helper, verification helper, tool, or conditional surface could be
  relevant.
- Load `references/taste-and-verification.md` before final audit, screenshots,
  interaction checks, or final response for triggered visual work.

## Trigger Policy

Trigger this skill when a task creates, changes, critiques, specifies, or
materially directs rendered frontend UI and the user asks for Geist,
Vercel-style UI, or generic clean, modern, premium, beautiful, polished
SaaS/developer-product visual design with no competing visual authority.

Do not trigger for TypeScript fixes, data wiring, API/state changes, analytics,
tests, build tooling, dependency work, or behavior-only accessibility fixes
unless rendered UI is created or materially changed.

An explicit non-Geist final visual system, brand style, supplied final non-Geist
design artifact, game style, or illustrative art direction overrides this skill.
Domain, industry, product, API, integration, content subject, Tailwind, shadcn,
Radix, or component-library mentions are not visual-system overrides or trigger
signals by themselves.

When triggered, Geist owns the visual system. Ignore generic frontend-design
pushes toward bold, unforgettable, maximal, ornamental, or surprising visuals
unless the user explicitly overrides Geist.

## Content, IA, And Brand Preservation Gate

When applying Geist to an existing site, app, dashboard, docs surface, or
product, preserve user-approved content, brand-defining visual moments,
information architecture, route destinations, and external/internal link intent
unless the user explicitly asks to change them or they create a concrete
accessibility, performance, security, correctness, or legal/trademark problem.

Restyle before replacing. If an existing hero effect, animation, certification
display, blog link, footer, contact path, navigation pattern, or route appears
intentional, adapt it to Geist constraints instead of deleting, hiding,
redirecting, duplicating, or inventing alternatives. If intent is unclear,
report the tradeoff and keep the existing behavior.

Do not invent new CTAs, contact details, destinations, routes, issuer logos,
certification labels, or navigation/footer sections solely to satisfy Geist,
no-dead-end, app-shell, or primary-action guidance. Use existing product
actions, existing routes, and existing content first.

For certification displays, preserve certification-specific official badge/logo
artwork when present. Do not replace it with generic certificate imagery,
certificate seals, course-completion marks, issuer/company logos, text labels,
text monograms, or Geist Badge/Pill UI treatments.

## Operating Loop

1. Identify the UI surface and scope: greenfield app, full redesign, narrow
   workflow, marketing page, dashboard, settings, table/list, command workflow,
   docs, or component library.
2. Select the matching Vercel/Geist reference archetype before designing. Do
   not treat the Vercel homepage as the default target for every Vercel-style
   request. For generic Vercel-style or Geist requests, use the official Geist
   docs plus 1-3 current Vercel surfaces that match the requested surface type
   when those pages are available. Use the homepage mainly for homepage, hero,
   launch, or broad marketing composition. For dashboards, docs, settings,
   forms, tables, pricing, portfolios, app shells, and component libraries,
   inspect comparable Vercel/Geist surfaces and components instead.
3. Inspect the project before designing: framework, Tailwind version, component
   library, icon library, font setup, theme tokens, existing primitives, routing,
   package manager, and validation commands.
4. Load the required references above.
5. Open current official Vercel pages for every required foundation, token
   source, guideline, brand/assets, and mapped component before implementation
   or strict claims. `https://vercel.com/design.md` is the canonical compact
   token/default source for light theme work; also open
   `https://vercel.com/design.dark.md` when dark mode or theme switching is in
   scope.
6. Complete the Foundation Gate before screen work: fonts, semantic color
   tokens, typography utilities, material/radius utilities, focus rings, app
   shell, primitives, shared states, and screen composition rules.
7. Map every UI requirement to an official Geist foundation/component,
   official composition, or constrained custom composition before inventing
   patterns.
8. Implement through shared tokens and primitives. Use Radix/shadcn only as
   behavior/accessibility infrastructure after Geist mapping; their visual
   defaults are not design authority.
9. Verify with the Taste Gate, revise failures, then report evidence and
   blockers honestly.

## Non-Negotiables

Official docs are binding design input, not optional inspiration.
`https://vercel.com/design.md` is required for every triggered visual task
because it is the official compact Geist token/default source for colors,
typography, spacing, rounded values, component defaults, layout rhythm,
elevation, motion, focus, and content voice. `https://vercel.com/design.dark.md`
is required when dark mode, theme switching, or dark screenshots are in scope.
Bundled snapshots in `references/vercel-design.md` and
`references/vercel-design-dark.md` exist so agents can inspect exact token tables
and defaults locally, but strict/docs-verified claims still require opening the
current live official documents because those pages are alpha.
Treat `design.md` as the foundation source. Use
`https://vercel.com/design/guidelines` for rendered UI interaction,
accessibility, state, browser, and polish checks. Use `https://vercel.com/font`
when installing/configuring Geist fonts or using Pixel. Use Geist Introduction,
Colors, Typography, or Materials only when the user asks for that page's detail,
`design.md` lacks a needed detail, or a component/page decision depends on it.
Brand/logo work requires `https://vercel.com/geist/brands`. Component work
requires every matching official component page from
`references/official-reference-map.md` or the live Geist component navigation.

If required official docs cannot be loaded after every available browsing/docs
tool is attempted in the current turn, state attempted URLs, tools, and exact
failures. Local rules then become advisory only, cannot satisfy
`Docs Evidence`, and cannot support strict/docs-verified claims. Label affected
work `local Geist fallback, not docs-verified`.

Final responses for triggered visual work must include the page-specific
`Docs Evidence` table defined in `references/source-of-truth-gate.md`. Do not
claim strict Geist, docs-aligned Geist, official Geist compliance,
source-of-truth alignment, or Vercel Taste Gate passage if any required applied
row is missing, blocked, lacks an exact section/anchor, or lacks a short
page-specific quote that affected a concrete decision. Strict claims also
require screenshot and interaction checks when those checks are possible.

Geist must own the relevant visual system. Do not create isolated
Vercel-looking widgets inside unrelated UI. Broad work covers app shell,
navigation, pages, forms, data views, dialogs, toasts, command menus, marketing
sections, and empty/loading/error states across all routable surfaces and shared
states. Narrow work covers the requested workflow plus touched primitives; say
`whole app not verified` unless every route/surface was audited.

Use Geist Sans globally, Geist Mono for code/technical identifiers, and Geist
Pixel only for a constrained display/brand accent when justified. Keep ordinary
product UI neutral-first, high-contrast, compact, semantic, accessible, and
state-driven. Typography and spacing should carry hierarchy; color should be
functional; borders should structure the UI; motion should be subtle and tied
to state.

Use a grid system by default, not a grid background: CSS grid/flex, columns,
rows, gutters, aligned cards, bordered cells, tables, dividers, spacing, and
stable responsive spans are normal Geist layout. Solid page and component
backgrounds are the default. Do not add decorative visible grid backgrounds,
graph-paper lines, blueprint lines, or page-wide repeating gradients from the
words grid layout, dashboard grid, feature grid, Vercel-style grid, or from an
agent-selected Vercel reference. Add visible guide/cell/grid background art only
when the user explicitly asks for visible grid art/backgrounds/cell guides, a
user-supplied design clearly shows them, or the requested UI surface is the
official Geist Grid component. Scope that art to the requested surface and make
it a real content grid with aligned cells; never place it behind unrelated hero
copy, product cards, tables, credentials, contact cells, app shells, or page
bodies. Full-page visible grid backgrounds require an explicit full-page request.

Skills.sh companions are routing helpers only. They never replace official
Geist docs, never define Geist visuals, and never satisfy `Docs Evidence`.

## Verification Contract

Before final response for triggered visual work, run the Vercel Taste Gate in
`references/taste-and-verification.md`: route inventory, current official docs,
Foundation Gate, component mapping, Web Interface Guidelines audit, screenshots,
interaction checks, responsive checks, anti-pattern scan, and revision loop.

If a local app can run, inspect mobile, laptop, desktop, and ultra-wide
viewports plus changed states such as menus, dialogs, empty states, loading
states, errors, and dense data views. If screenshots or interaction checks are
possible and not captured, do not claim the Taste Gate passed. If the app
cannot run or verification is blocked, state the exact blocker and use only the
allowed limited claim.

Final responses must report the important evidence concisely: commands, URL,
viewport sizes, screenshot paths or blocker, changed states inspected,
interaction summary, Docs Evidence, revisions made because of the audit, and
any `whole app not verified` scope limit.
