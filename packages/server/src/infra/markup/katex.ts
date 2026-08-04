import type { KatexOptions } from 'katex'

import 'katex/contrib/mhchem'

// Shared KaTeX options for every server-side `renderToString` call (the
// save-time PT prerender and the admin math preview endpoint).
// `output: 'mathml'` keeps payloads CSS-free, `throwOnError` rejects
// malformed TeX instead of serializing error markup into stored content,
// `trust: false` disables `\href` / `\html*` escapes. The mhchem
// side-effect import registers the `\ce` macros process-wide — keep it
// next to the options so every renderer shares the same grammar.
export const KATEX_OPTIONS: KatexOptions = {
  output: 'mathml',
  throwOnError: true,
  trust: false,
}
