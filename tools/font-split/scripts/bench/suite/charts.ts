import type { Bounds, Series, Tick } from '@kobato/font-split/scripts/bench/suite/chart-kit'
import type {
  BenchmarkResults,
  PageCostReport,
  SizeBand,
  SliceVariant,
  SweepPoint,
} from '@kobato/font-split/scripts/bench/suite/types'

import { median } from '@kobato/font-split/scripts/bench/stats'
import { conditionKey, loadingTable, shippedPoint } from '@kobato/font-split/scripts/bench/suite/analysis'
import { assertStated } from '@kobato/font-split/scripts/bench/suite/assert-stated'
import {
  barPanel,
  esc,
  linePanel,
  niceBounds,
  PALETTE,
  r1,
  svgDocument,
  zeroBounds,
} from '@kobato/font-split/scripts/bench/suite/chart-kit'
import { int, one } from '@kobato/font-split/scripts/bench/suite/format'
import {
  LOADING_CONDITIONS,
  LOADING_LAMBDAS_KB,
  SHIPPED_LAMBDA_KB,
} from '@kobato/font-split/scripts/bench/suite/profile'

const LAMBDA_TICKS: readonly Tick[] = [20, 30, 40, 50, 60, 80, 120].map((v) => ({ v }))
const LOW_LAMBDA_KB = 30
const kbs = (bytes: number): number => bytes / 1024
const axis = (value: number): string => (Number.isInteger(value) ? int(value) : one(value))

function bandLabel(band: string): string {
  return band.replace('-', '–')
}

function deployedVsShipped(deployed: PageCostReport, shipped: PageCostReport): string {
  const cards = [
    { title: 'Cold page, mean (KB)', left: kbs(deployed.coldMeanBytes), right: kbs(shipped.coldMeanBytes) },
    { title: 'Cold page, p90 (KB)', left: kbs(deployed.coldP90Bytes), right: kbs(shipped.coldP90Bytes) },
    { title: 'Cold page, requests (mean)', left: deployed.coldMeanChunks, right: shipped.coldMeanChunks },
    {
      title: 'Cold page, requests (p90 / max)',
      left: deployed.coldP90Chunks,
      right: shipped.coldP90Chunks,
      leftLabel: `${deployed.coldP90Chunks} / ${deployed.coldMaxChunks}`,
      rightLabel: `${shipped.coldP90Chunks} / ${shipped.coldMaxChunks}`,
    },
    { title: 'Next page, new bytes (KB)', left: kbs(deployed.nextMeanBytes), right: kbs(shipped.nextMeanBytes) },
    { title: 'Next page, new requests', left: deployed.nextMeanChunks, right: shipped.nextMeanChunks },
  ]
  const body: string[] = []
  cards.forEach((card, index) => {
    const label = (value: number, custom: string | undefined): string =>
      custom ?? (value < 200 ? one(value) : int(value))
    body.push(
      ...barPanel({
        x: 14 + (index % 3) * 290,
        y: index < 3 ? 0 : 190,
        title: card.title,
        colors: [PALETTE.red, PALETTE.blue],
        bars: [
          { label: label(card.left, card.leftLabel), value: card.left },
          { label: label(card.right, card.rightLabel), value: card.right },
        ],
      }),
    )
  })
  body.push(
    `<rect x="22" y="362" width="12" height="12" rx="2" fill="${PALETTE.red}"/>`,
    `<text x="39" y="372" fill="${PALETTE.muted}">cn-font-split (deployed package)</text>`,
    `<rect x="242" y="362" width="12" height="12" rx="2" fill="${PALETTE.blue}"/>`,
    `<text x="259" y="372" fill="${PALETTE.muted}">shipped algorithm (λ=${SHIPPED_LAMBDA_KB} KB)</text>`,
  )
  return svgDocument(870, 380, body)
}

function frontier(points: readonly SweepPoint[], deployed: PageCostReport, kind: 'cold' | 'next'): string {
  const cold = kind === 'cold'
  const bytes = (report: PageCostReport): number => kbs(cold ? report.coldMeanBytes : report.nextMeanBytes)
  const requests = (report: PageCostReport): number => (cold ? report.coldMeanChunks : report.nextMeanChunks)
  const seriesFor = (pick: (report: PageCostReport) => number): Series[] => [
    { name: 'blog', color: PALETTE.blue, points: points.map((point) => [point.lambdaKb, pick(point.corpora.blog)]) },
    {
      name: 'wiki hans',
      color: PALETTE.green,
      points: points.map((point) => [point.lambdaKb, pick(point.corpora.hans)]),
    },
    {
      name: 'wiki hant',
      color: PALETTE.amber,
      points: points.map((point) => [point.lambdaKb, pick(point.corpora.hant)]),
    },
  ]
  const every = points.flatMap((point) => [point.corpora.blog, point.corpora.hans, point.corpora.hant])
  const bytesBounds = niceBounds([...every.map(bytes), bytes(deployed)])
  const requestBounds = zeroBounds([...every.map(requests), requests(deployed)])
  const note = 'DP λ (KB) — dashed red: cn-font-split on the blog corpus'
  const body = linePanel({
    title: cold ? 'Cold page bytes' : 'Next page, new bytes (KB)',
    xMin: 20,
    xMax: 120,
    xTicks: LAMBDA_TICKS,
    yMin: bytesBounds.min,
    yMax: bytesBounds.max,
    yStep: bytesBounds.step,
    yFormat: int,
    series: seriesFor(bytes),
    references: [{ y: bytes(deployed), color: PALETTE.red }],
    xRef: SHIPPED_LAMBDA_KB,
    xRefLabel: `λ=${SHIPPED_LAMBDA_KB}`,
    caption: note,
  })
  body.push(
    ...linePanel({
      ty: 300,
      title: cold ? 'Cold page requests' : 'Next page, new requests',
      xMin: 20,
      xMax: 120,
      xTicks: LAMBDA_TICKS,
      yMin: requestBounds.min,
      yMax: requestBounds.max,
      yStep: requestBounds.step,
      yFormat: axis,
      series: seriesFor(requests),
      references: [{ y: requests(deployed), color: PALETTE.red }],
      xRef: SHIPPED_LAMBDA_KB,
      xRefLabel: `λ=${SHIPPED_LAMBDA_KB}`,
      caption: note,
    }),
  )
  return svgDocument(880, 600, body)
}

function grid(body: string[], bounds: Bounds, at: (value: number) => number, fixed: number, horizontal: boolean): void {
  for (let value = bounds.min; value <= bounds.max * 1.0001; value += bounds.step) {
    const position = r1(at(value))
    body.push(
      horizontal
        ? `<line x1="${fixed}" x2="856" y1="${position}" y2="${position}" stroke="${PALETTE.muted}" stroke-opacity="0.25"/>`
        : `<line x1="${position}" x2="${position}" y1="${fixed}" y2="${fixed + 4}" stroke="${PALETTE.muted}"/>`,
    )
    body.push(
      horizontal
        ? `<text x="${fixed - 8}" y="${r1(position + 4)}" text-anchor="end" fill="${PALETTE.muted}">${int(value)}</text>`
        : `<text x="${position}" y="${fixed + 16}" text-anchor="middle" fill="${PALETTE.muted}">${int(value)}</text>`,
    )
  }
}

function tradeOff(points: readonly SweepPoint[], deployed: PageCostReport): string {
  const left = 64
  const right = 856
  const top = 40
  const bottom = 416
  const requests = points.map((point) => point.corpora.blog.coldMeanChunks)
  const bytes = points.map((point) => kbs(point.corpora.blog.coldMeanBytes))
  const xBounds = niceBounds(requests, 5)
  const yBounds = niceBounds(bytes, 5)
  const sx = (value: number): number => left + ((value - xBounds.min) / (xBounds.max - xBounds.min)) * (right - left)
  const sy = (value: number): number => bottom - ((value - yBounds.min) / (yBounds.max - yBounds.min)) * (bottom - top)
  const body: string[] = []
  grid(body, yBounds, sy, left, true)
  grid(body, xBounds, sx, bottom, false)
  body.push(`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${PALETTE.muted}"/>`)
  body.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="${PALETTE.muted}"/>`)
  const placed: [number, number][] = []
  points.forEach((point, index) => {
    const px = sx(point.corpora.blog.coldMeanChunks)
    const py = sy(kbs(point.corpora.blog.coldMeanBytes))
    if (index === 0) {
      body.push(
        `<path d="${points
          .map(
            (entry, at) =>
              `${at ? 'L' : 'M'}${r1(sx(entry.corpora.blog.coldMeanChunks))} ${r1(sy(kbs(entry.corpora.blog.coldMeanBytes)))}`,
          )
          .join(' ')}" fill="none" stroke="${PALETTE.blue}" stroke-width="2"/>`,
      )
    }
    body.push(`<circle cx="${r1(px)}" cy="${r1(py)}" r="3" fill="${PALETTE.blue}"/>`)
    let lx = px + 8
    let ly = py - 7
    let anchor = 'start'
    const hits = (): boolean => placed.some(([qx, qy]) => Math.abs(qx - lx) < 30 && Math.abs(qy - ly) < 13)
    if (hits()) {
      ly = py - 21
    }
    if (hits()) {
      lx = px - 8
      ly = py + 15
      anchor = 'end'
    }
    placed.push([lx, ly])
    body.push(
      `<text x="${r1(lx)}" y="${r1(ly)}" text-anchor="${anchor}" fill="${PALETTE.blue}">${point.lambdaKb}</text>`,
    )
  })
  const dx = sx(deployed.coldMeanChunks)
  const dy = sy(kbs(deployed.coldMeanBytes))
  const star = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI / 5) * index - Math.PI / 2
    return `${r1(dx + (index % 2 ? 5 : 11) * Math.cos(angle))},${r1(dy + (index % 2 ? 5 : 11) * Math.sin(angle))}`
  })
  body.push(`<polygon points="${star.join(' ')}" fill="${PALETTE.red}"/>`)
  body.push(`<text x="${r1(dx + 16)}" y="${r1(dy + 4)}" fill="${PALETTE.red}">cn-font-split</text>`)
  body.push(
    `<text x="${left}" y="456" fill="${PALETTE.muted}">labels are λ in KB, connected in λ order — lower-left is better</text>`,
    `<text x="${left}" y="476" fill="${PALETTE.muted}">Cold page KB against requests per page, blog corpus</text>`,
  )
  return svgDocument(880, 480, body)
}

function byPageSize(sweep: readonly SweepPoint[], deployed: PageCostReport): string {
  const shipped = shippedPoint(sweep)
  const low = sweep.find((point) => point.lambdaKb === LOW_LAMBDA_KB)
  const bands = shipped.corpora.blog.bySize
  if (bands.length !== deployed.bySize.length) {
    throw new Error('the deployed package and the shipped package report different page-size bands')
  }
  const tables = [
    { name: 'cn-font-split', color: PALETTE.red, dash: '6 4', reports: deployed.bySize },
    ...(low === undefined
      ? []
      : [{ name: `λ=${LOW_LAMBDA_KB} KB`, color: PALETTE.purple, dash: undefined, reports: low.corpora.blog.bySize }]),
    { name: `λ=${SHIPPED_LAMBDA_KB} KB`, color: PALETTE.blue, dash: undefined, reports: shipped.corpora.blog.bySize },
  ]
  const seriesFor = (pick: (report: SizeBand) => number): Series[] =>
    tables.map((table) => ({
      name: table.name,
      color: table.color,
      dash: table.dash ?? undefined,
      points: table.reports.map((band, index) => [index, pick(band)]),
    }))
  const bytes = tables.flatMap((table) => table.reports.map((band) => kbs(band.meanBytes)))
  const requests = tables.flatMap((table) => table.reports.map((band) => band.meanChunks))
  const bytesBounds = niceBounds(bytes)
  const requestBounds = zeroBounds(requests)
  const ticks = bands.map((band, index) => ({ v: index, label: bandLabel(band.band) }))
  const pages = bands.map((band) => `${bandLabel(band.band)} ${band.pages}`).join(' · ')
  const body = linePanel({
    title: 'Cold page bytes by page size',
    xMin: -0.5,
    xMax: bands.length - 0.5,
    xTicks: ticks,
    yMin: bytesBounds.min,
    yMax: bytesBounds.max,
    yStep: bytesBounds.step,
    yFormat: int,
    series: seriesFor((band) => kbs(band.meanBytes)),
    caption: 'Distinct codepoints per page (blog corpus)',
  })
  body.push(
    ...linePanel({
      ty: 300,
      title: 'Cold page requests by page size',
      xMin: -0.5,
      xMax: bands.length - 0.5,
      xTicks: ticks,
      yMin: requestBounds.min,
      yMax: requestBounds.max,
      yStep: requestBounds.step,
      yFormat: axis,
      series: seriesFor((band) => band.meanChunks),
      caption: `Distinct codepoints per page (blog corpus): ${pages} pages`,
    }),
  )
  return svgDocument(880, 600, body)
}

function loadingTime(results: BenchmarkResults): string {
  const result = results.loadingTime!
  const table = loadingTable(result)
  const colors = { 'h1-slow': PALETTE.amber, 'h1-fast': PALETTE.red, 'h2-slow': PALETTE.green, 'h2-fast': PALETTE.blue }
  const conditions = LOADING_CONDITIONS.map((condition) => {
    const key = conditionKey(condition.protocol, condition.link)
    return { key, name: `${condition.protocol.toUpperCase()} ${condition.link}`, color: colors[key] }
  }).filter((condition) => table[condition.key] !== undefined)
  const panelBounds = (kind: 'cold' | 'next'): { yMin: number; yMax: number; yStep: number } => {
    const values = conditions.flatMap((condition) =>
      result.lambdasKb.map((lambda) => table[condition.key]![kind][String(lambda)]!),
    )
    return {
      yMin: Math.floor((Math.min(...values) - 0.02) * 10) / 10,
      yMax: Math.ceil((Math.max(...values) + 0.02) * 10) / 10,
      yStep: 0.1,
    }
  }
  const ticks: readonly Tick[] = [30, 45, 55, 80, 120].map((v) => ({ v }))
  const seriesFor = (kind: 'cold' | 'next'): Series[] =>
    conditions.map((condition) => ({
      name: condition.name,
      color: condition.color,
      dots: true,
      points: result.lambdasKb.map((lambda) => [lambda, table[condition.key]![kind][String(lambda)]!]),
    }))
  const first = LOADING_LAMBDAS_KB[0]!
  const last = LOADING_LAMBDAS_KB.at(-1)!
  const body = linePanel({
    title: 'Cold page',
    xMin: first,
    xMax: last,
    xTicks: ticks,
    ...panelBounds('cold'),
    yFormat: one,
    height: 222,
    series: seriesFor('cold'),
    references: [{ y: 1, color: PALETTE.muted, dash: '5 4' }],
    caption: `DP λ (KB) — paired median time until the page’s fonts are loaded, relative to λ=${first} KB (cold page)`,
  })
  body.push(
    ...linePanel({
      ty: 320,
      title: 'Next page',
      xMin: first,
      xMax: last,
      xTicks: ticks,
      ...panelBounds('next'),
      yFormat: one,
      height: 222,
      series: seriesFor('next'),
      references: [{ y: 1, color: PALETTE.muted, dash: '5 4' }],
      caption: `DP λ (KB) — paired median, relative to λ=${first} KB (next page: cold cache for the new page’s chunks)`,
    }),
  )
  return svgDocument(880, 640, body)
}

const SLICE_ORDER: readonly SliceVariant[] = ['raw', 'q8', 'q9', 'q10', 'previous-profile', 'shipped', 'pgo']
const SLICE_COLORS: Record<SliceVariant, string> = {
  raw: PALETTE.green,
  q8: '#2da44e',
  q9: '#2da44e',
  q10: PALETTE.amber,
  'previous-profile': PALETTE.red,
  shipped: PALETTE.blue,
  pgo: PALETTE.purple,
}
const SLICE_NOTES: Record<SliceVariant, readonly string[]> = {
  raw: ['subsetting', 'only', 'no compression'],
  q8: ['q8'],
  q9: ['q9'],
  q10: ['q10'],
  'previous-profile': ['q11', 'default', 'profile'],
  shipped: ['q11', 'codegen-units=1'],
  pgo: ['q11', '+', 'PGO'],
}

function slicingTime(results: BenchmarkResults): string {
  const timed = results.slicingTime!.fonts[results.fonts[0]!.key]
  if (timed === undefined) {
    throw new Error('the slicing-time results carry no entry for the primary font')
  }
  const manyProfiles = timed.variants.filter((entry) => entry.variant === 'pgo').length > 1
  const bars = SLICE_ORDER.flatMap((variant) => timed.variants.filter((entry) => entry.variant === variant)).map(
    (entry) => ({
      seconds: median(entry.samples.map((sample) => sample.ms)) / 1000,
      bytes: median(entry.samples.map((sample) => sample.chunkBytes)),
      color: SLICE_COLORS[entry.variant],
      notes:
        entry.variant === 'pgo' && manyProfiles
          ? [...SLICE_NOTES.pgo, `run ${entry.build}`]
          : SLICE_NOTES[entry.variant],
    }),
  )
  const left = 58
  const right = 856
  const bottom = 208
  const top = 30
  const max = Math.max(...bars.map((bar) => bar.seconds))
  const yMax = Math.ceil((max * 1.08) / 3.2) * 3.2
  const sy = (value: number): number => bottom - (value / yMax) * (bottom - top)
  const slot = (right - left) / bars.length
  const body: string[] = []
  for (let value = 0; value <= yMax * 1.0001; value += yMax / 4) {
    const y = r1(sy(value))
    body.push(
      `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="${PALETTE.muted}" stroke-opacity="${value ? 0.25 : 1}"/>`,
    )
    body.push(`<text x="${left - 8}" y="${r1(y + 4)}" text-anchor="end" fill="${PALETTE.muted}">${one(value)}</text>`)
  }
  bars.forEach((bar, index) => {
    const x = left + slot * (index + 0.5)
    const height = Math.max(1, r1(bottom - sy(bar.seconds)))
    body.push(
      `<rect x="${r1(x - 36.5)}" y="${r1(bottom - height)}" width="73" height="${height}" rx="3" fill="${bar.color}"/>`,
    )
    body.push(
      `<text x="${r1(x)}" y="${r1(bottom - height - 5)}" text-anchor="middle" fill="${PALETTE.muted}">${bar.seconds.toFixed(2)}</text>`,
    )
    bar.notes.forEach((note, line) => {
      body.push(
        `<text x="${r1(x)}" y="${224 + line * 14}" text-anchor="middle" fill="${PALETTE.muted}">${esc(note)}</text>`,
      )
    })
    body.push(`<text x="${r1(x)}" y="296" text-anchor="middle" fill="${PALETTE.muted}">${int(bar.bytes)} B</text>`)
  })
  body.push(
    `<text x="${left}" y="14" fill="${PALETTE.muted}">Slicing ${esc(results.fonts[0]!.label)}, wall time (seconds, ${results.slicingTime!.threads} Rayon threads, median)</text>`,
  )
  return svgDocument(880, 300, body)
}

export function renderCharts(results: BenchmarkResults): Map<string, string> {
  const [primary] = results.fonts
  if (primary === undefined) {
    throw new Error('the results carry no font')
  }
  const sweep = results.pageCost.sweep[primary.key] ?? []
  const deployed = results.pageCost.deployed.corpora.blog
  const charts = new Map<string, string>()
  charts.set('deployed-vs-retune.svg', deployedVsShipped(deployed, shippedPoint(sweep).corpora.blog))
  charts.set('lambda-cold-page.svg', frontier(sweep, deployed, 'cold'))
  charts.set('lambda-next-page.svg', frontier(sweep, deployed, 'next'))
  charts.set('lambda-trade-off.svg', tradeOff(sweep, deployed))
  charts.set('by-page-size.svg', byPageSize(sweep, deployed))
  if (results.loadingTime !== null) {
    charts.set('loading-time.svg', loadingTime(results))
  }
  if (results.slicingTime !== null) {
    charts.set('slicing-time.svg', slicingTime(results))
  }
  for (const [name, svg] of charts) {
    assertStated(`${name} chart`, svg)
  }
  return charts
}
