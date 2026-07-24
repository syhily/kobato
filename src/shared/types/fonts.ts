/**
 * A single resolved, browser-ready web font in a slot: the CSS family name
 * (for the `font-family` stack) and the absolute URL of the self-hosted
 * `result.css` (for the `<link rel="stylesheet">`). Populated server-side
 * by `resolveFontsForRender` and consumed by the root `<head>`.
 */
export interface ResolvedFont {
  family: string
  href: string
}

/**
 * The SSR-renderable fonts payload returned by the root loader. Each slot is
 * an ordered list; `post` / `code` are empty unless the route opts in.
 */
export interface ResolvedFonts {
  global: ResolvedFont[]
  post: ResolvedFont[]
  code: ResolvedFont[]
}

export interface DeleteFontInput {
  fontId: string
}
