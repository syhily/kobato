import type {
  LoadingRun,
  LoadingTimeResult,
  PageCostReport,
  SweepPoint,
} from '@kobato/font-split/scripts/bench/suite/types'

import { fitLinear, median } from '@kobato/font-split/scripts/bench/stats'
import { SHIPPED_LAMBDA_KB } from '@kobato/font-split/scripts/bench/suite/profile'

export interface RelativeRow {
  pairs: number
  cold: Record<string, number>
  next: Record<string, number>
}

export type RelativeTable = Record<string, RelativeRow>

export type ConditionKey = 'h1-slow' | 'h1-fast' | 'h2-slow' | 'h2-fast'

export function conditionKey(protocol: 'h1' | 'h2', link: 'slow' | 'fast'): ConditionKey {
  return `${protocol}-${link}`
}

function relativeRuns(
  result: LoadingTimeResult,
  pairs: readonly { runs: Record<string, LoadingRun> }[],
  field: 'coldMs' | 'nextMs',
): Record<string, number> {
  const base = String(result.lambdasKb[0])
  return Object.fromEntries(
    result.lambdasKb.map((lambda) => [
      String(lambda),
      median(pairs.map((pair) => pair.runs[String(lambda)]![field] / pair.runs[base]![field])),
    ]),
  )
}

export function loadingTable(result: LoadingTimeResult): RelativeTable {
  return Object.fromEntries(
    result.conditions.map((condition) => [
      conditionKey(condition.protocol, condition.link),
      {
        pairs: condition.pairs.length,
        cold: relativeRuns(result, condition.pairs, 'coldMs'),
        next: relativeRuns(result, condition.pairs, 'nextMs'),
      },
    ]),
  )
}

export interface LoadingFit {
  observations: number
  msPerKb: number
  msPerRequest: number
  r2: number
  coldRequestShare: number
  nextRequestShare: number
}

export function loadingFits(result: LoadingTimeResult, shipped: PageCostReport): Record<string, LoadingFit> {
  const share = (bytes: number, requests: number, msPerKb: number, msPerRequest: number): number => {
    const total = (bytes / 1024) * msPerKb + requests * msPerRequest
    return total === 0 ? 0 : (requests * msPerRequest) / total
  }
  return Object.fromEntries(
    result.conditions.map((condition) => {
      const rows = condition.pairs.flatMap((pair) =>
        Object.values(pair.runs).flatMap((run) => [
          { x: [1, 0, run.coldBytes / 1024, run.coldFaces], y: run.coldMs },
          { x: [0, 1, run.nextNewBytes / 1024, run.nextNewFaces], y: run.nextMs },
        ]),
      )
      const { coefficients, r2 } = fitLinear(rows)
      const msPerKb = coefficients[2]!
      const msPerRequest = coefficients[3]!
      return [
        conditionKey(condition.protocol, condition.link),
        {
          observations: rows.length,
          msPerKb,
          msPerRequest,
          r2,
          coldRequestShare: share(shipped.coldMeanBytes, shipped.coldMeanChunks, msPerKb, msPerRequest),
          nextRequestShare: share(shipped.nextMeanBytes, shipped.nextMeanChunks, msPerKb, msPerRequest),
        },
      ]
    }),
  )
}

export interface StairStep {
  lambdaKb: number
  kbPerRequest: number
}

export function staircase(points: readonly SweepPoint[]): StairStep[] {
  return points.slice(1).map((point, index) => {
    const previous = points[index]!
    return {
      lambdaKb: point.lambdaKb,
      kbPerRequest:
        (point.corpora.blog.coldMeanBytes - previous.corpora.blog.coldMeanBytes) /
        1024 /
        (previous.corpora.blog.coldMeanChunks - point.corpora.blog.coldMeanChunks),
    }
  })
}

export function shippedPoint(points: readonly SweepPoint[]): SweepPoint {
  const point = points.find((entry) => entry.lambdaKb === SHIPPED_LAMBDA_KB)
  if (point === undefined) {
    throw new Error(`the sweep has no λ=${SHIPPED_LAMBDA_KB} KB point`)
  }
  return point
}
