## Motion, Performance, Copy, And Guidelines

Load this before UI copy, performance-relevant UI, motion/interaction, or Web
Interface Guidelines overlay work. Use `component-system.md` only for the
component behavior affected by these rules.

## Motion And Interaction

- Motion should clarify state changes: open/close, loading, selection,
  reordering, hover/focus, success/error.
- Do not invent universal timing ranges. Use current `design.md` motion guidance
  first: many interactions can be instant, and nonessential motion should stay
  short, physical, and tied to a state change. Use durations from consulted
  component docs when they exist; otherwise keep motion minimal, interruptible,
  and purpose-driven without claiming numeric timing as `Docs Evidence`.
- Prefer CSS animations/transitions first, then Web Animations API, and avoid
  main-thread JavaScript-driven animation when possible.
- Prefer opacity/transform transitions. Avoid layout-thrashing animations. Never
  use `transition: all`; explicitly list intended properties such as `opacity`
  and `transform`.
- Choose easing based on what changes: size, distance, and trigger. When
  `design.md` gives a specific easing for the pattern, use that before inventing
  another curve.
- Respect reduced motion preferences.
- Make animations cancelable/interruptible and input-driven. Set
  `transform-origin` to the perceived origin of the motion.
- For SVG transforms or animations, apply transforms to `<g>` wrappers and set
  `transform-box: fill-box` plus `transform-origin` to avoid browser origin bugs.
- Do not add scroll-triggered spectacle, parallax, bouncing, or decorative motion
  to product surfaces.

## Performance-Relevant UI Gate

Apply performance rules when a task touches rendered UI, animations, data views,
media, forms, or interaction-heavy surfaces:

- Test or reason explicitly about iOS Low Power Mode and macOS Safari when those
  environments are available or the surface is user-facing.
- Profile perf-sensitive flows with CPU and network throttling when local tooling
  makes that feasible. Disable browser extensions that can distort measurement
  when using a real browser profile.
- Keep input loops cheap. Prefer uncontrolled inputs when appropriate, minimize
  re-renders, track re-renders with React DevTools or React Scan when available,
  and make controlled keystrokes fast enough for typing.
- Minimize layout work: batch reads/writes, avoid unnecessary reflows/repaints,
  avoid render-time layout reads such as `getBoundingClientRect`,
  `offsetHeight`, `offsetWidth`, and `scrollTop`, and do not use main-thread
  JavaScript for layout that CSS can handle.
- Treat mutation latency as product UI quality: `POST`, `PATCH`, and `DELETE`
  interactions should target completion under 500ms where the backend and
  network make that feasible, with optimistic UI, rollback, or Undo where
  appropriate.
- Virtualize large lists instead of rendering every row/card into the main
  layout. Local heuristic, not official Web Interface Guidelines evidence: treat
  lists over 50 rendered items as requiring virtualization unless profiling or a
  current official guideline check supports a different threshold; use
  `content-visibility: auto` only as a measured supplement, not a replacement
  for required virtualization.
- For images/media, set explicit dimensions or reserve space to avoid CLS.
  Preload only above-the-fold images and lazy-load the rest.
- Preload critical fonts, subset fonts to the scripts/code points and axes
  actually used, and avoid font loading that shifts layout.
- Use preconnect only for real external asset origins the project already needs.
- Move long main-thread work to Web Workers or existing background processing so
  interaction remains responsive.

## Copy Rules

- Product UI labels, buttons, titles, and tabs use Title Case. Body copy, helper
  text, and toasts use sentence case.
- Name actions with a verb and noun when the object matters: `Deploy Project`,
  `Delete Member`. Avoid vague actions such as `Confirm`, `OK`, or a bare verb
  when the noun is needed for clarity.
- Use active voice, second person, concise action-oriented language, consistent
  nouns, numerals for counts, `&` where it fits Vercel style, and the ellipsis
  character for follow-up/loading labels: `Rename…`, `Loading…`, `Saving…`.
- Avoid technical jargon unless the audience is explicitly developer/operator
  and the term is useful.
- Error messages should say what happened plus what to do next. Buttons and
  links in error states must provide a clear exit or fix path.
- Toasts name the specific thing that changed, omit the trailing period, and do
  not say `successfully`.
- Empty states should describe the current absence and offer the next action.
- Use consistent placeholder and currency formats within a context. Format dates,
  times, numbers, delimiters, and currencies for the user's locale. Prefer
  numerals, curly quotes, the ellipsis character, and non-breaking spaces or word
  joiners for glued terms such as `10&nbsp;MB`, `⌘&nbsp;+&nbsp;K`, and
  `Vercel&nbsp;SDK`. Skip `please` and marketing superlatives in product UI.
- Detect language from explicit user/account settings, the `Accept-Language`
  header, or `navigator.languages`; never infer language from IP or GPS location
  alone. Tidy widows, orphans, rag, and line breaks where the text-rendering
  stack supports it.
- Prefer inline help before tooltips. Tooltips are a last resort for supplemental
  explanation and must not hide required information.
- Anchored headings need `scroll-margin-top` so deep links do not hide headings
  under sticky headers.
- Mark brand names, product names, code tokens, and technical identifiers with
  `translate="no"` when browser translation could corrupt them.
- Layouts must handle short, average, and very long user-generated content
  without clipping, overlap, or broken controls.
- Local heuristic, not `Docs Evidence`: avoid redundant visible instructional
  text when labels and affordances already make a control clear.
- No screen may dead-end: empty, sparse, dense, permission, offline, and error
  screens must include a clear next step, retry, back path, request-access path,
  or contact/support path as appropriate.

## Vercel Web Interface Guidelines Overlay

Apply `https://vercel.com/design/guidelines` to every Geist-styled app:

- Keyboard works everywhere; focus is visible and managed; visual targets below
  24px need expanded hit targets and mobile targets are 44px; mobile inputs use
  at least 16px text; never disable browser zoom or add zoom-limiting viewport
  settings such as `user-scalable=no`; every screen has empty, sparse, dense,
  loading, and error states.
- Persist view-affecting or workflow-affecting client state in the URL: search
  text, filters, sort, tabs, pagination, expanded panels, selected views, mode,
  drawer/detail selection, date ranges, comparison views, and any state stored in
  a client store that affects the visible view or workflow. Back/Forward and
  refresh must restore state and scroll position. Ephemeral focus, hover,
  in-flight request, and unsaved draft state may remain local.
- Use optimistic updates when success is likely, reconcile on server response,
  and on failure show an error plus rollback or Undo.
- Use tooltip timing that delays the first tooltip in a group and makes
  subsequent peer tooltips immediate.
- Set `overscroll-behavior: contain` intentionally for modals, drawers, and
  similar contained scroll regions.
- Clean drag interactions disable text selection and apply `inert` to prevent
  simultaneous hover/selection/interaction while dragging.
- Keyboard shortcuts are locale-aware and show platform-specific symbols.
- If any part of a control looks interactive, it must be interactive. Labels
  activate controls; checkbox/radio labels and controls share one generous
  target. Set `touch-action: manipulation` on controls and define
  `-webkit-tap-highlight-color` to match the design.
- No screen dead-ends; headings and buttons in product UI use Title Case; labels
  are specific; counts use numerals; numbers and units use a space/non-breaking
  space.
- Browser chrome is implementation work, not a final-only check. Official
  guideline: browser UI should match the page background, and the root should set
  the appropriate `color-scheme` for the active theme so browser/device UI keeps
  contrast. Geist implementation recommendation: align `<meta name="theme-color">`
  with the active Background 1 color; use media-specific meta tags when both
  light and dark OS themes are supported, and set `color-scheme` on the root
  according to the app's theme model.
