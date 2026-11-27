import type { ColumnAlign } from '@kobato/font-split/scripts/bench/markdown'
import type { StairStep } from '@kobato/font-split/scripts/bench/suite/analysis'
import type {
  BenchmarkResults,
  CorpusReports,
  ShapingRelation,
  ShapingResult,
  SweepPoint,
} from '@kobato/font-split/scripts/bench/suite/types'

import { escapeCell, renderTable } from '@kobato/font-split/scripts/bench/markdown'
import { median } from '@kobato/font-split/scripts/bench/stats'
import { shippedPoint } from '@kobato/font-split/scripts/bench/suite/analysis'
import { day, int, kb, kib, mb, mib, one, pct, pct1, signed } from '@kobato/font-split/scripts/bench/suite/format'
import { STAGES } from '@kobato/font-split/scripts/bench/suite/options'
import { LOADING_LAMBDAS_KB, SHIPPED_LAMBDA_KB } from '@kobato/font-split/scripts/bench/suite/profile'

const RIGHT: ColumnAlign = 'right'
const LEFT: ColumnAlign = 'left'

export const range = (values: readonly number[], format: (value: number) => string): string => {
  if (values.length === 0) {
    throw new Error('range of an empty sample')
  }
  const low = Math.min(...values)
  const high = Math.max(...values)
  const lowText = format(low)
  const highText = format(high)
  return lowText === highText ? lowText : `${lowText}–${highText}`
}

export const signedChange = (value: number, base: number): number => (value / base) * 100 - 100

export const signedText = (value: number): string => `${signed(value, 1)}%`

export function pointAt(sweep: readonly SweepPoint[], lambdaKb: number): SweepPoint | undefined {
  return sweep.find((point) => point.lambdaKb === lambdaKb)
}

export function headerBlock(results: BenchmarkResults): string {
  const machine = results.machine
  const chrome = results.loadingTime === null ? '' : `, Chrome ${results.loadingTime.browser}`
  const stages = STAGES
  const carried = stages.filter((stage) => {
    const stamp = results.stages[stage]
    return stamp !== null && stamp !== results.startedAt
  })
  const missing = stages.filter((stage) => results.stages[stage] === null)
  const fingerprint = results.slicingTime?.fingerprint
  return (
    `Measured **${day(results.generatedAt)}** on commit \`${results.commit}\` (${machine.cpu}, ${machine.cpus} logical CPUs; ` +
    `${machine.rustc}; Node ${machine.node}${chrome}) with \`pnpm run bench:font-split\`.` +
    (fingerprint === undefined || fingerprint === '' ? '' : ` Algorithm fingerprint \`${fingerprint}\`.`) +
    ` The deployed package was measured on ${day(results.pageCost.deployed.measured)}.` +
    (results.quick ? ' A `--quick` run: its timing samples are too few for conclusions.' : '') +
    (carried.length === 0
      ? ''
      : ` Carried over from earlier runs: ${carried.map((stage) => `${stage} (${day(results.stages[stage]!)})`).join(', ')}.`) +
    (missing.length === 0 ? '' : ` Not measured: ${missing.join(', ')}.`)
  )
}

function shippedCssBytes(results: BenchmarkResults, shipped: CorpusReports['blog']): number {
  const primary = results.fonts[0]
  const variant =
    primary === undefined
      ? undefined
      : results.slicingTime?.fonts[primary.key]?.variants.find((entry) => entry.variant === 'shipped')
  return variant === undefined ? shipped.cssBytes : median(variant.samples.map((sample) => sample.cssBytes))
}

export function shippedBlock(results: BenchmarkResults, shipped: SweepPoint): string {
  const left = results.pageCost.deployed.corpora.blog
  const right = shipped.corpora.blog
  const css = shippedCssBytes(results, right)
  const deployedPackage = results.pageCost.deployed.chunkBytes + results.pageCost.deployed.cssBytes
  const shippedPackage = right.totalBytes + css
  return renderTable(
    [
      'Blog corpus, mean per page',
      `cn-font-split (wasm, ${results.pageCost.deployed.chunks} chunks)`,
      `**Shipped (λ=${SHIPPED_LAMBDA_KB} KB, ${right.chunks} chunks)**`,
      'Δ',
    ],
    [
      [
        'Cold page',
        `${kb(left.coldMeanBytes)} KB`,
        `${kb(right.coldMeanBytes)} KB`,
        pct(right.coldMeanBytes, left.coldMeanBytes),
      ],
      [
        'Cold page p90',
        `${kb(left.coldP90Bytes)} KB`,
        `${kb(right.coldP90Bytes)} KB`,
        pct(right.coldP90Bytes, left.coldP90Bytes),
      ],
      [
        'Cold requests',
        one(left.coldMeanChunks),
        one(right.coldMeanChunks),
        pct(right.coldMeanChunks, left.coldMeanChunks),
      ],
      [
        'Cold requests p90 / max',
        `${left.coldP90Chunks} / ${left.coldMaxChunks}`,
        `${right.coldP90Chunks} / ${right.coldMaxChunks}`,
        `p90 ${pct(right.coldP90Chunks, left.coldP90Chunks)}`,
      ],
      [
        'Session of 5 pages',
        `${kb(left.sessionMeanBytes)} KB`,
        `${kb(right.sessionMeanBytes)} KB`,
        pct(right.sessionMeanBytes, left.sessionMeanBytes),
      ],
      [
        'Next page, new bytes',
        `${kb(left.nextMeanBytes)} KB`,
        `${kb(right.nextMeanBytes)} KB`,
        pct(right.nextMeanBytes, left.nextMeanBytes),
      ],
      [
        'Next page, new requests',
        one(left.nextMeanChunks),
        one(right.nextMeanChunks),
        pct(right.nextMeanChunks, left.nextMeanChunks),
      ],
      [
        'Package (chunks + CSS)',
        `${mb(deployedPackage)} MB`,
        `${mb(shippedPackage)} MB`,
        pct(shippedPackage, deployedPackage),
      ],
      [
        'result.css with the family name',
        kib(results.pageCost.deployed.cssBytes),
        kib(css),
        pct(css, results.pageCost.deployed.cssBytes),
      ],
    ],
    [LEFT, RIGHT, RIGHT, RIGHT],
  )
}

export function corporaBlock(deployed: CorpusReports, shipped: SweepPoint): string {
  const row = (label: string, corpus: keyof CorpusReports): string[] => [
    label,
    `${kb(deployed[corpus].coldMeanBytes)} / ${one(deployed[corpus].coldMeanChunks)}`,
    `${kb(shipped.corpora[corpus].coldMeanBytes)} / ${one(shipped.corpora[corpus].coldMeanChunks)}`,
    `${kb(deployed[corpus].nextMeanBytes)} KB / ${one(deployed[corpus].nextMeanChunks)} req`,
    `${kb(shipped.corpora[corpus].nextMeanBytes)} KB / ${one(shipped.corpora[corpus].nextMeanChunks)} req`,
  ]
  return renderTable(
    ['Corpus', 'cn-font-split cold KB / req', 'Shipped cold KB / req', 'cn-font-split next page', 'Shipped next page'],
    [row('wiki hans', 'hans'), row('wiki hant', 'hant'), row('blog', 'blog')],
    [LEFT, RIGHT, RIGHT, RIGHT, RIGHT],
  )
}

export function packageFactsBlock(results: BenchmarkResults): string {
  return results.fonts
    .map((font, index) => {
      const shaping = results.shaping[font.key]
      const point = pointAt(results.pageCost.sweep[font.key] ?? [], SHIPPED_LAMBDA_KB)
      if (shaping === undefined || point === undefined) {
        return ''
      }
      const blog = point.corpora.blog
      const ascii = shaping.largestFaceAscii === 0 ? '' : `, ${shaping.largestFaceAscii} of them ASCII`
      return (
        `${index === 0 ? 'The primary font' : 'The second font'} \`${font.file}\` (${mib(font.bytes)} MiB): ${shaping.faces} faces; ` +
        `blog cold page ${kb(blog.coldMeanBytes)} KB / ${one(blog.coldMeanChunks)} requests (p90 ${blog.coldP90Chunks} / max ` +
        `${blog.coldMaxChunks}), next page ${kb(blog.nextMeanBytes)} KB / ${one(blog.nextMeanChunks)} requests; the largest face is ` +
        `${kib(shaping.largestFaceBytes)} for ${shaping.largestFaceCodepoints} codepoints${ascii}; ${shaping.facesWithoutIdeograph} ` +
        `of the ${shaping.faces} faces contain no ideograph.`
      )
    })
    .filter((part) => part !== '')
    .join('\n\n')
}

export function shapingBlock(results: BenchmarkResults): string {
  const fonts = results.fonts
  const shapingOf = (key: string): ShapingResult => {
    const shaping = results.shaping[key]
    if (shaping === undefined) {
      throw new Error(`the shaping results carry no entry for ${key}`)
    }
    return shaping
  }
  const relationRow = (label: string, pick: (shaping: ShapingResult) => ShapingRelation): string[] => [
    `${label} (${fonts.map((font) => int(pick(shapingOf(font.key)).relations)).join(' / ')})`,
    ...fonts.map((font) => {
      const relation = pick(shapingOf(font.key))
      return pct1(relation.colocated, relation.relations)
    }),
  ]
  const table = renderTable(
    ['Relations', ...fonts.map((font) => font.label)],
    [
      relationRow('Kern pairs with a non-zero adjustment, both glyphs ASCII', (shaping) => shaping.kernAscii),
      relationRow('Kern pairs with a non-zero adjustment, both glyphs encoded', (shaping) => shaping.kernMapped),
      relationRow('Mark-to-base pairs of one subtable, both glyphs encoded', (shaping) => shaping.markBase),
      relationRow('Ligatures whose components are all encoded', (shaping) => shaping.ligature),
    ],
    [LEFT, ...fonts.map(() => RIGHT)],
  )
  const subtables = fonts
    .map((font) => {
      const shaping = shapingOf(font.key)
      const wrapped =
        shaping.extensionSubtables === 0
          ? 'none inside Extension lookups'
          : `${shaping.extensionSubtables} Extension lookups among them`
      return `${font.label} carries ${shaping.pairSubtables} pair-positioning and ${shaping.markSubtables} mark-to-base subtables, ${wrapped}`
    })
    .join('; ')
  return `${table}\n\n${subtables}.`
}

export function renderingBlock(results: BenchmarkResults): string {
  const fonts = results.fonts
  const first = results.rendering[fonts[0]!.key] ?? []
  const rows = first.map((row, index) =>
    [`\`${escapeCell(row.text)}\`${row.note === '' ? '' : ` (${row.note})`}`, `${one(row.originalWidth)} px`].concat(
      fonts.map((font) => {
        const measured = results.rendering[font.key]?.[index]
        if (measured === undefined) {
          return ''
        }
        if (measured.identical) {
          return 'pixel-identical'
        }
        return `differs (${measured.differingPixels < 0 ? 'shape' : `${int(measured.differingPixels)} px`}, ${one(measured.packageWidth)} px)`
      }),
    ),
  )
  return renderTable(
    ['String (48 px)', 'Original width', ...fonts.map((font) => `${font.label} package vs original`)],
    rows,
    [LEFT, RIGHT, ...fonts.map(() => LEFT)],
  )
}

export function frontierBlock(sweep: readonly SweepPoint[], steps: readonly StairStep[]): string {
  const table = renderTable(
    [
      'λ KB',
      'Chunks',
      'Blog: cold KB / req',
      'Blog req p90 / max',
      'Blog next KB / req',
      'Wiki hans: cold KB / req',
      'Wiki hant: cold KB / req',
    ],
    sweep.map((point) => {
      const { blog, hans, hant } = point.corpora
      return [
        point.lambdaKb === SHIPPED_LAMBDA_KB ? `**${point.lambdaKb}**` : String(point.lambdaKb),
        int(blog.chunks),
        `${kb(blog.coldMeanBytes)} / ${one(blog.coldMeanChunks)}`,
        `${blog.coldP90Chunks} / ${blog.coldMaxChunks}`,
        `${kb(blog.nextMeanBytes)} / ${one(blog.nextMeanChunks)}`,
        `${kb(hans.coldMeanBytes)} / ${one(hans.coldMeanChunks)}`,
        `${kb(hant.coldMeanBytes)} / ${one(hant.coldMeanChunks)}`,
      ]
    }),
    [RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT],
  )
  return `${table}\n\n${staircaseNote(sweep, steps)}`
}

function staircaseNote(sweep: readonly SweepPoint[], steps: readonly StairStep[]): string {
  const cost = (lambdaKb: number): number | undefined => steps.find((step) => step.lambdaKb === lambdaKb)?.kbPerRequest
  const span = (lambdas: readonly number[]): string | null => {
    const costs = lambdas.flatMap((lambdaKb) => {
      const value = cost(lambdaKb)
      return value === undefined ? [] : [value]
    })
    return costs.length === 0 ? null : range(costs, one)
  }
  const toShipped = span([37.5, 45, SHIPPED_LAMBDA_KB])
  if (toShipped === null) {
    return ''
  }
  const from = pointAt(sweep, SHIPPED_LAMBDA_KB)
  const plateau = pointAt(sweep, 60)
  const beyond = span([80, 120])
  return (
    `Between λ=30 KB and λ=${SHIPPED_LAMBDA_KB} KB every request saved costs ${toShipped} KB.` +
    (from === undefined || plateau === undefined
      ? ''
      : ` λ=60 KB changes the package by ${one(Math.abs(plateau.corpora.blog.coldMeanChunks - from.corpora.blog.coldMeanChunks))} ` +
        `requests and ${kb(Math.abs(plateau.corpora.blog.coldMeanBytes - from.corpora.blog.coldMeanBytes))} KB per page.`) +
    (beyond === null ? '' : ` Beyond that a request saved costs ${beyond} KB.`)
  )
}

export function byPageSizeBlock(sweep: readonly SweepPoint[], deployed: CorpusReports): string {
  const shipped = shippedPoint(sweep)
  const low = pointAt(sweep, LOADING_LAMBDAS_KB[0]!)
  const high = pointAt(sweep, LOADING_LAMBDAS_KB.at(-1)!)
  if (low === undefined || high === undefined) {
    throw new Error('the sweep lacks the λ points the page-size table needs')
  }
  const bands = shipped.corpora.blog.bySize
  const cell = (report: { meanBytes: number; meanChunks: number }): string =>
    `${int(report.meanBytes / 1024)} KB / ${one(report.meanChunks)} req`
  const rows = bands.map((band, index) => [
    band.band.replace('-', '–'),
    String(band.pages),
    cell(deployed.blog.bySize[index]!),
    cell(low.corpora.blog.bySize[index]!),
    cell(band),
    cell(high.corpora.blog.bySize[index]!),
  ])
  const bytes = bands.map((band, index) => signedChange(band.meanBytes, deployed.blog.bySize[index]!.meanBytes))
  const requests = bands.map((band, index) => signedChange(band.meanChunks, deployed.blog.bySize[index]!.meanChunks))
  const falling = requests.filter((value) => value < 0)
  const rising = requests.filter((value) => value >= 0)
  const requestNote =
    rising.length === 0
      ? `requests fall on every band (${range(falling, signedText)})`
      : falling.length === 0
        ? `requests rise on every band (${range(rising, signedText)})`
        : `requests fall on ${falling.length} of ${bands.length} bands (${range(falling, signedText)}) and rise on the rest (${range(rising, signedText)})`
  return (
    `Against the deployed package every size band changes its bytes by ${range(bytes, signedText)}; ` +
    `${requestNote}. A long page touches more of the small mid-frequency chunks.\n\n` +
    renderTable(
      [
        'Distinct codepoints',
        'Pages',
        'cn-font-split',
        `λ=${LOADING_LAMBDAS_KB[0]} KB`,
        `**λ=${SHIPPED_LAMBDA_KB} KB**`,
        `λ=${LOADING_LAMBDAS_KB.at(-1)} KB`,
      ],
      rows,
      [RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT],
    )
  )
}
