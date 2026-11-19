import type { KatexOptions } from 'katex'

import 'katex/contrib/mhchem'

export const KATEX_OPTIONS: KatexOptions = {
  output: 'mathml',
  throwOnError: true,
  trust: false,
}
