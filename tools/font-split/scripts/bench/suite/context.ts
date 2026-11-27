import type { ResolvedFont, SuiteContext } from '@kobato/font-split/scripts/bench/suite/types'

import { SHIPPED_LAMBDA_KB } from '@kobato/font-split/scripts/bench/suite/profile'

export function packageDirFor(ctx: SuiteContext, font: ResolvedFont, lambdaKb: number): string {
  const dir = ctx.sweepDirs.get(font.key)?.get(lambdaKb)
  if (dir === undefined) {
    throw new Error(`no λ=${lambdaKb} KB package was sliced for ${font.label}`)
  }
  return dir
}

export function shippedDirFor(ctx: SuiteContext, font: ResolvedFont): string {
  return packageDirFor(ctx, font, SHIPPED_LAMBDA_KB)
}
