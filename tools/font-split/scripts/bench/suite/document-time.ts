import type { ColumnAlign } from '@kobato/font-split/scripts/bench/markdown'
import type { RelativeTable } from '@kobato/font-split/scripts/bench/suite/analysis'
import type {
  BenchmarkResults,
  PageCostReport,
  SliceVariant,
  SliceVariantResult,
  SweepPoint,
} from '@kobato/font-split/scripts/bench/suite/types'

import { renderTable } from '@kobato/font-split/scripts/bench/markdown'
import { median } from '@kobato/font-split/scripts/bench/stats'
import { conditionKey, loadingFits, loadingTable, shippedPoint } from '@kobato/font-split/scripts/bench/suite/analysis'
import { pointAt, range, signedChange, signedText } from '@kobato/font-split/scripts/bench/suite/document-page-cost'
import {
  int,
  kb,
  kib,
  mb,
  mib,
  num,
  one,
  pct,
  percent,
  three,
  two,
} from '@kobato/font-split/scripts/bench/suite/format'
import {
  conditionName,
  LOADING_CONDITIONS,
  MU_KB,
  SHIPPED_LAMBDA_KB,
} from '@kobato/font-split/scripts/bench/suite/profile'

const RIGHT: ColumnAlign = 'right'
const LEFT: ColumnAlign = 'left'
const NOT_MEASURED = '*Not measured in this run.*'
const TOO_FEW_FOR_A_FIT = '*A `--quick` run: too few samples to fit the cost model.*'
const SLICE_ORDER: readonly SliceVariant[] = ['raw', 'q8', 'q9', 'q10', 'previous-profile', 'shipped', 'pgo']
const SLICE_LABELS: Record<SliceVariant, string> = {
  raw: 'Subsetting only, no WOFF2 compression',
  q8: 'WOFF2 quality 8',
  q9: 'WOFF2 quality 9',
  q10: 'WOFF2 quality 10',
  'previous-profile': 'WOFF2 quality 11, fat LTO with default codegen units, unstripped',
  shipped: '**WOFF2 quality 11, fat LTO + codegen-units = 1 + strip**',
  pgo: 'WOFF2 quality 11, shipped build + profile-guided optimization',
}
const QUALITY_LABELS: Partial<Record<SliceVariant, string>> = { q10: 'quality 10', q9: 'quality 9', q8: 'quality 8' }

function relativeTable(results: BenchmarkResults): RelativeTable {
  if (results.loadingTime === null) {
    throw new Error('no loading-time results')
  }
  return loadingTable(results.loadingTime)
}

export function loadingBlock(results: BenchmarkResults): string {
  if (results.loadingTime === null) {
    return NOT_MEASURED
  }
  const table = relativeTable(results)
  const lambdas = results.loadingTime.lambdasKb
  const rows = LOADING_CONDITIONS.flatMap((condition) =>
    (['cold', 'next'] as const).map((kind) => {
      const row = table[conditionKey(condition.protocol, condition.link)]
      if (row === undefined) {
        throw new Error(`no loading-time runs for ${conditionName(condition.protocol, condition.link)}`)
      }
      return [
        kind === 'cold' ? 'Cold page' : 'Next page',
        condition.protocol === 'h1' ? 'H1' : 'H2',
        condition.link,
        String(row.pairs),
      ].concat(lambdas.map((lambdaKb) => three(row[kind][String(lambdaKb)]!)))
    }),
  )
  return renderTable(['', 'Protocol', 'Link', 'pairs', ...lambdas.map(String)], rows, [
    LEFT,
    LEFT,
    LEFT,
    RIGHT,
    ...lambdas.map(() => RIGHT),
  ])
}

export function modelBlock(results: BenchmarkResults, shipped: PageCostReport): string {
  if (results.loadingTime === null) {
    return NOT_MEASURED
  }
  if (results.quick) {
    return TOO_FEW_FOR_A_FIT
  }
  const fits = loadingFits(results.loadingTime, shipped)
  const fitOf = (protocol: 'h1' | 'h2', link: 'slow' | 'fast') => fits[conditionKey(protocol, link)]!
  const rows = LOADING_CONDITIONS.map((condition) => {
    const fit = fitOf(condition.protocol, condition.link)
    return [
      condition.link,
      condition.protocol === 'h1' ? 'H1' : 'H2',
      num(fit.msPerKb, 2),
      num(fit.msPerRequest, 1),
      three(fit.r2),
    ]
  })
  const perRequest = (protocol: 'h1' | 'h2', link: 'slow' | 'fast'): string =>
    num(fitOf(protocol, link).msPerRequest, 1)
  const perKb = (link: 'slow' | 'fast'): string =>
    range(
      LOADING_CONDITIONS.filter((condition) => condition.link === link).map(
        (condition) => fitOf(condition.protocol, condition.link).msPerKb,
      ),
      (value: number) => num(value, 2),
    )
  const shareOf = (fit: { coldRequestShare: number; nextRequestShare: number }, kind: 'cold' | 'next'): number =>
    (kind === 'cold' ? fit.coldRequestShare : fit.nextRequestShare) * 100
  const slowShare = (kind: 'cold' | 'next'): string =>
    range(
      LOADING_CONDITIONS.filter((condition) => condition.link === 'slow').map((condition) =>
        shareOf(fitOf(condition.protocol, condition.link), kind),
      ),
      percent,
    )
  const nominal = (bytesPerSecond: number): string => two((1024 / bytesPerSecond) * 1000)
  const links = results.loadingTime.links
  return (
    renderTable(['Link', 'Protocol', 'ms per KB', 'ms per request', 'R²'], rows, [LEFT, LEFT, RIGHT, RIGHT, RIGHT]) +
    `\n\nFitting every load of one link and protocol on its bytes and requests (\x60time = offset + bytes × a + requests × b\x60, R² ` +
    `${range(
      LOADING_CONDITIONS.map((condition) => fitOf(condition.protocol, condition.link).r2),
      three,
    )}) prices both. A request costs ` +
    `${perRequest('h1', 'slow')} ms on HTTP/1.1 (six connections) and ${perRequest('h2', 'slow')} ms on HTTP/2 at ${links.slow.latencyMs} ms latency, ` +
    `${perRequest('h1', 'fast')} ms and ${perRequest('h2', 'fast')} ms at ${links.fast.latencyMs} ms. A KB costs ${perKb('slow')} ms on the slow link ` +
    `(nominal ${nominal(links.slow.downloadBytesPerSecond)} ms) and ${perKb('fast')} ms on the fast one (nominal ` +
    `${nominal(links.fast.downloadBytesPerSecond)} ms). At λ=${SHIPPED_LAMBDA_KB} KB requests are ${slowShare('cold')} of a cold page's transfer ` +
    `time on the slow link, ${percent(shareOf(fitOf('h1', 'fast'), 'cold'))} of an HTTP/1.1 cold page and ${percent(shareOf(fitOf('h1', 'fast'), 'next'))} of its next page ` +
    `on the fast link, against ${percent(shareOf(fitOf('h2', 'fast'), 'cold'))} and ${percent(shareOf(fitOf('h2', 'fast'), 'next'))} on HTTP/2.`
  )
}

export function decisionBlock(results: BenchmarkResults, sweep: readonly SweepPoint[]): string {
  if (results.loadingTime === null) {
    return `**λ=${SHIPPED_LAMBDA_KB} KB, μ=${MU_KB} KB** are the shipped DP parameters; the loading-time stage was not measured in this run.`
  }
  const table = relativeTable(results)
  const low = pointAt(sweep, 45)
  const shipped = shippedPoint(sweep)
  const middle = pointAt(sweep, 80)
  const high = pointAt(sweep, 120)
  if (low === undefined || middle === undefined || high === undefined) {
    throw new Error('the sweep lacks the λ points the decision paragraph needs')
  }
  const requests = low.corpora.blog.coldMeanChunks - shipped.corpora.blog.coldMeanChunks
  const bytes = shipped.corpora.blog.coldMeanBytes - low.corpora.blog.coldMeanBytes
  const bytesChange = signedText(signedChange(shipped.corpora.blog.coldMeanBytes, low.corpora.blog.coldMeanBytes))
  const requestCounts = `${one(low.corpora.blog.coldMeanChunks)} vs ${one(shipped.corpora.blog.coldMeanChunks)}`
  if (results.quick) {
    return (
      `**λ=${SHIPPED_LAMBDA_KB} KB, μ=${MU_KB} KB.** From λ=45 KB to λ=${SHIPPED_LAMBDA_KB} KB a cold page takes ` +
      `${kb(bytes)} KB (${bytesChange}) more bytes for ${one(requests)} fewer requests (${requestCounts}); the loading-time ` +
      'ranges need a full run, this one is `--quick`. The rationale and the rejected alternatives are recorded in ADR-0010.'
    )
  }
  const move = (from: number, to: number, kind: 'cold' | 'next'): string =>
    range(
      LOADING_CONDITIONS.map((condition) => {
        const row = table[conditionKey(condition.protocol, condition.link)]!
        return signedChange(row[kind][String(to)]!, row[kind][String(from)]!)
      }),
      signedText,
    )
  return (
    `**λ=${SHIPPED_LAMBDA_KB} KB, μ=${MU_KB} KB.** From λ=45 KB to λ=${SHIPPED_LAMBDA_KB} KB the cold page moves by ` +
    `${move(45, SHIPPED_LAMBDA_KB, 'cold')} and the next page by ${move(45, SHIPPED_LAMBDA_KB, 'next')} for ${one(requests)} fewer ` +
    `requests per cold page (${requestCounts}) and ` +
    `${kb(bytes)} KB (${bytesChange}) more bytes. From ` +
    `λ=${SHIPPED_LAMBDA_KB} KB to 80 KB the cold page moves by ${move(SHIPPED_LAMBDA_KB, 80, 'cold')} and the next page by ` +
    `${move(SHIPPED_LAMBDA_KB, 80, 'next')}; from 80 KB to 120 KB by ${move(80, 120, 'cold')} and ${move(80, 120, 'next')}. ` +
    'The rationale and the rejected alternatives are recorded in ADR-0010.'
  )
}

function entriesOf(results: BenchmarkResults, fontKey: string, variant: SliceVariant): SliceVariantResult[] {
  return results.slicingTime?.fonts[fontKey]?.variants.filter((candidate) => candidate.variant === variant) ?? []
}

function secondsOfEntry(entry: SliceVariantResult): number {
  return median(entry.samples.map((sample) => sample.ms)) / 1000
}

function spreadOfEntry(entry: SliceVariantResult): string {
  const seconds = entry.samples.map((sample) => sample.ms / 1000)
  return `${two(Math.min(...seconds))}–${two(Math.max(...seconds))}`
}

function secondsOf(results: BenchmarkResults, fontKey: string, variant: SliceVariant): number | null {
  const [entry] = entriesOf(results, fontKey, variant)
  return entry === undefined ? null : secondsOfEntry(entry)
}

function spreadOf(results: BenchmarkResults, fontKey: string, variant: SliceVariant): string | null {
  const [entry] = entriesOf(results, fontKey, variant)
  return entry === undefined ? null : spreadOfEntry(entry)
}

function listing(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts.join('')
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

export function costsBlock(results: BenchmarkResults): string {
  if (results.slicingTime === null) {
    return NOT_MEASURED
  }
  const slicing = results.slicingTime
  const lines = results.fonts.flatMap((font) => {
    const shipped = secondsOf(results, font.key, 'shipped')
    const raw = secondsOf(results, font.key, 'raw')
    const phases = slicing.fonts[font.key]?.phases
    if (shipped === null) {
      return []
    }
    const phasesNote =
      phases === undefined || phases === null
        ? ''
        : ` A separate phase-timed run (${two((phases.preSubsetMs + phases.runSubsetMs + phases.linkSubsetMs) / 1000)} s) ` +
          `spends ${two(phases.preSubsetMs / 1000)} s on partitioning with the byte probes, ` +
          `${two(phases.runSubsetMs / 1000)} s on subsetting and WOFF2 compression and ${phases.linkSubsetMs.toFixed(0)} ms ` +
          `on the CSS; the largest face (${kib(phases.largestFaceBytes)}) alone compresses in ` +
          `${int(phases.largestFaceMs)} ms.`
    const rawNote =
      raw === null
        ? ''
        : ` Subsetting without WOFF2 compression takes ${two(raw)} s (${share(raw, shipped)} of the shipped time).`
    return [
      `- **Slicing time, ${font.label}**: ${two(shipped)} s for the ${mib(font.bytes)} MiB font at ${slicing.threads} Rayon threads.` +
        phasesNote +
        rawNote,
    ]
  })
  const [primary] = results.fonts
  const shipped = primary === undefined ? null : secondsOf(results, primary.key, 'shipped')
  const defaultSeconds = primary === undefined ? null : secondsOf(results, primary.key, 'previous-profile')
  const shippedAddon = primary === undefined ? undefined : entriesOf(results, primary.key, 'shipped')[0]?.addonBytes
  const defaultAddon =
    primary === undefined ? undefined : entriesOf(results, primary.key, 'previous-profile')[0]?.addonBytes
  if (
    shipped !== null &&
    defaultSeconds !== null &&
    shippedAddon !== undefined &&
    shippedAddon !== null &&
    defaultAddon !== undefined &&
    defaultAddon !== null
  ) {
    lines.push(
      `- **Release profile** (fat LTO, one codegen unit, stripped): the addon is ${mb(shippedAddon)} MB against ` +
        `${mb(defaultAddon)} MB (${pct(shippedAddon, defaultAddon)}) with default codegen units and symbols kept; slicing ` +
        `takes ${two(shipped)} s against ${two(defaultSeconds)} s.`,
    )
  }
  const profiles = primary === undefined ? [] : entriesOf(results, primary.key, 'pgo')
  if (primary !== undefined && shipped !== null && profiles.length > 0) {
    const effects = profiles.map((entry) => signedChange(secondsOfEntry(entry), shipped))
    const measured = profiles.map(
      (entry) => `${two(secondsOfEntry(entry))} s (${pct(secondsOfEntry(entry), shipped)}; ${spreadOfEntry(entry)} s)`,
    )
    const single = profiles.length === 1
    const noun = `${profiles.length} independent training run${single ? '' : 's'} and build${single ? '' : 's'}`
    const span = single
      ? ''
      : ` — from one training run to the next its effect spans ${signedText(Math.min(...effects))} to ${signedText(
          Math.max(...effects),
        )}`
    lines.push(
      `- **Profile-guided optimization**: ${noun} measure${single ? 's' : ''} ${listing(measured)} against the shipped ` +
        `${two(shipped)} s (${spreadOf(results, primary.key, 'shipped')} s over the interleaved runs), trained on the ` +
        `benchmark fonts; ${slicing.profdata ?? 'llvm-profdata'}${span}.`,
    )
  }
  lines.push(
    `- **Algorithm fingerprint** \`${slicing.fingerprint}\`: an already-uploaded font is re-sliced on its next upload when its ` +
      'stored package predates it.',
  )
  return lines.join('\n')
}

export function slicingBlock(results: BenchmarkResults): string {
  const [primary, ...secondary] = results.fonts
  const timed = primary === undefined ? undefined : results.slicingTime?.fonts[primary.key]
  if (primary === undefined || timed === undefined) {
    return NOT_MEASURED
  }
  const profiles = entriesOf(results, primary.key, 'pgo').length
  const rows = SLICE_ORDER.flatMap((variant) => entriesOf(results, primary.key, variant)).map((entry) => {
    const labelled = entry.variant === 'pgo' && profiles > 1
    return [
      labelled ? `${SLICE_LABELS.pgo}, training run ${entry.build}` : SLICE_LABELS[entry.variant],
      `${two(secondsOfEntry(entry))} s (${spreadOfEntry(entry)})`,
      entry.addonBytes === null ? '—' : `${mb(entry.addonBytes)} MB`,
      `${(median(entry.samples.map((sample) => sample.chunkBytes)) / 1e6).toFixed(2)} MB`,
      String(median(entry.samples.map((sample) => sample.chunks))),
    ]
  })
  const table = renderTable(
    ['Variant', `Slicing time (${results.slicingTime!.threads} threads), median (min–max)`, 'Addon', 'Output', 'Faces'],
    rows,
    [LEFT, RIGHT, RIGHT, RIGHT, RIGHT],
  )
  const others = secondary
    .map((font) => {
      const parts = (['shipped', 'q10', 'q9', 'q8'] as const).flatMap((variant) => {
        const seconds = secondsOf(results, font.key, variant)
        return seconds === null ? [] : [`${QUALITY_LABELS[variant] ?? 'shipped'} ${two(seconds)} s`]
      })
      return parts.length === 0 ? '' : `${font.label}: ${parts.join(', ')}.`
    })
    .filter((part) => part !== '')
  const raw = secondsOf(results, primary.key, 'raw')
  const shipped = secondsOf(results, primary.key, 'shipped')
  const closing =
    raw === null || shipped === null
      ? ''
      : `Subsetting itself is ${share(raw, shipped)} of the shipped slicing time; compression at quality 11 is the rest.`
  return [table, ...others, closing].filter((part) => part !== '').join('\n\n')
}

function share(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`
}
