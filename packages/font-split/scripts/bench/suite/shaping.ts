import type { ShapingResult, SuiteContext } from '@kobato/font-split/scripts/bench/suite/types'

import { runShaping } from '@kobato/font-split/scripts/bench/suite/cargo'
import { shippedDirFor } from '@kobato/font-split/scripts/bench/suite/context'

export function measureShaping(ctx: SuiteContext): Record<string, ShapingResult> {
  return Object.fromEntries(
    ctx.fonts.map((font) => {
      const result = runShaping(font.path, shippedDirFor(ctx, font))
      ctx.log(
        `shaping: ${font.label} — ${result.faces} faces, ${result.kernMapped.colocated}/${result.kernMapped.relations} kern pairs co-located`,
      )
      return [font.key, result]
    }),
  )
}
