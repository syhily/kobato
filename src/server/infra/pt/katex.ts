import type { KatexOptions } from 'katex'

import 'katex/contrib/mhchem'

// Shared KaTeX options for every renderer. `throwOnError: true` rejects
// malformed TeX instead of storing error markup; the mhchem import must
// stay next to these so every renderer shares the `\ce` grammar.
export const KATEX_OPTIONS: KatexOptions = {
  output: 'mathml',
  throwOnError: true,
  trust: false,
}
