/** A resolved, browser-ready web font: CSS family name + absolute URL of the self-hosted `result.css`. Populated by `resolveFontsForRender`, consumed by the root `<head>`. */
export interface ResolvedFont {
  family: string
  href: string
}

/** SSR-renderable fonts payload from the root loader; `post` / `code` are empty unless the route opts in. */
export interface ResolvedFonts {
  global: ResolvedFont[]
  post: ResolvedFont[]
  code: ResolvedFont[]
}

export interface DeleteFontInput {
  fontId: string
}
