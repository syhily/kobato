import type { ColumnAlign } from '@kobato/font-split/scripts/bench/markdown'
import type { BenchmarkResults, Corpus } from '@kobato/font-split/scripts/bench/suite/types'

import { renderTable } from '@kobato/font-split/scripts/bench/markdown'
import { shippedPoint, staircase } from '@kobato/font-split/scripts/bench/suite/analysis'
import { assertStated } from '@kobato/font-split/scripts/bench/suite/assert-stated'
import {
  byPageSizeBlock,
  corporaBlock,
  frontierBlock,
  headerBlock,
  packageFactsBlock,
  renderingBlock,
  shapingBlock,
  shippedBlock,
} from '@kobato/font-split/scripts/bench/suite/document-page-cost'
import {
  costsBlock,
  decisionBlock,
  loadingBlock,
  modelBlock,
  slicingBlock,
} from '@kobato/font-split/scripts/bench/suite/document-time'
import { int, one } from '@kobato/font-split/scripts/bench/suite/format'
import {
  LINKS,
  LOADING_LAMBDAS_KB,
  loadingPlan,
  MU_KB,
  SLICE_RUNS,
  SLICE_RUNS_SECONDARY,
  SWEEP_LAMBDAS_KB,
} from '@kobato/font-split/scripts/bench/suite/profile'

function fixtureBlock(results: BenchmarkResults): string {
  const fixture = results.pageCost.fixture
  const row = (label: string, corpus: Corpus): string[] => {
    const report = fixture[corpus]
    return [
      label,
      `${report.chunks} · ${int(report.coldMeanBytes)} B / ${int(report.coldP90Bytes)} B · ${one(report.coldMeanChunks)} · ` +
        `${int(report.sessionMeanBytes)} B · ${int(report.incrementalMeanBytes)} B`,
    ]
  }
  return renderTable(
    ['Corpus', 'Chunks, cold mean / p90, requests, session(5), incremental'],
    [row('wiki hans', 'hans'), row('wiki hant', 'hant'), row('blog', 'blog')],
    ['left', 'left'] satisfies ColumnAlign[],
  )
}

function parametersBlock(results: BenchmarkResults): string {
  const plan = loadingPlan(false)
  const pairs = (link: 'slow' | 'fast'): number =>
    results.loadingTime?.pairsPerLink[link] ?? plan.find((entry) => entry.link === link)?.pairs ?? 0
  const count = (amount: number, noun: string): string => `${amount} ${noun}${amount === 1 ? '' : 's'}`
  const runs = (fontKey: string, fallback: number): number => {
    const lengths = (results.slicingTime?.fonts[fontKey]?.variants ?? []).map((variant) => variant.samples.length)
    return lengths.length === 0 ? fallback : Math.max(...lengths)
  }
  const [primary, secondary] = results.fonts
  const link = (name: 'slow' | 'fast'): string => {
    const profile = LINKS[name]
    const mbps = (bytesPerSecond: number): string => ((bytesPerSecond * 8) / 1e6).toFixed(2).replace(/\.?0+$/, '')
    return `${name} link ${mbps(profile.downloadBytesPerSecond)} Mbps down, ${mbps(profile.uploadBytesPerSecond)} up, ${profile.latencyMs} ms latency`
  }
  const threads = results.slicingTime?.threads
  return [
    `- **Sweep**: λ = ${SWEEP_LAMBDAS_KB.join(', ')} KB at μ = ${MU_KB} KB; the loading-time stage compares λ = ${LOADING_LAMBDAS_KB.join(', ')} KB.`,
    `- **Links**: ${link('slow')}; ${link('fast')}.`,
    `- **Samples**: ${count(pairs('slow'), 'page pair')} per point on the slow link and ${count(pairs('fast'), 'page pair')} on the fast link; ` +
      `${count(primary === undefined ? SLICE_RUNS : runs(primary.key, SLICE_RUNS), 'interleaved slicing run')} per variant ` +
      `(${secondary === undefined ? SLICE_RUNS_SECONDARY : runs(secondary.key, SLICE_RUNS_SECONDARY)} for the second font)` +
      `${threads === undefined ? '' : ` at ${threads} Rayon threads`}.`,
    `- **Corpora**: ${results.pageCost.fixture.blog.pages} blog pages, ${results.pageCost.fixture.hans.pages} held-out wiki pages per script dimension.`,
  ].join('\n')
}

export function renderBlocks(results: BenchmarkResults): Record<string, string> {
  const [primary] = results.fonts
  if (primary === undefined) {
    throw new Error('the results carry no font')
  }
  const sweep = results.pageCost.sweep[primary.key] ?? []
  const shipped = shippedPoint(sweep)
  const blocks = {
    header: headerBlock(results),
    parameters: parametersBlock(results),
    'shipped-vs-deployed': shippedBlock(results, shipped),
    corpora: corporaBlock(results.pageCost.deployed.corpora, shipped),
    'package-facts': packageFactsBlock(results),
    'shaping-colocation': shapingBlock(results),
    rendering: renderingBlock(results),
    frontier: frontierBlock(sweep, staircase(sweep)),
    'by-page-size': byPageSizeBlock(sweep, results.pageCost.deployed.corpora),
    'loading-time': loadingBlock(results),
    'loading-model': modelBlock(results, shipped.corpora.blog),
    decision: decisionBlock(results, sweep),
    'fixture-baseline': fixtureBlock(results),
    costs: costsBlock(results),
    'slicing-time': slicingBlock(results),
  }
  for (const [name, block] of Object.entries(blocks)) {
    assertStated(`${name} block`, block)
  }
  return blocks
}
