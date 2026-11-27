import type { Stage, SuiteOptions } from '@kobato/font-split/scripts/bench/suite/options'
import type { BenchmarkResults, ResolvedFont, SuiteContext } from '@kobato/font-split/scripts/bench/suite/types'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { runCommand } from '@kobato/font-split/scripts/bench/command'
import { measureLoadingTime } from '@kobato/font-split/scripts/bench/suite/loading-time'
import { STAGES } from '@kobato/font-split/scripts/bench/suite/options'
import { measurePageCost, sweepDirName } from '@kobato/font-split/scripts/bench/suite/page-cost'
import { benchmarkDocument, repoRoot, resultsFile } from '@kobato/font-split/scripts/bench/suite/paths'
import { measureRendering } from '@kobato/font-split/scripts/bench/suite/rendering'
import { renderBenchmark } from '@kobato/font-split/scripts/bench/suite/report'
import { measureShaping } from '@kobato/font-split/scripts/bench/suite/shaping'
import { measureSlicingTime } from '@kobato/font-split/scripts/bench/suite/slicing-time'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'

type Payload = Pick<BenchmarkResults, 'pageCost' | 'shaping' | 'rendering' | 'loadingTime' | 'slicingTime'>

const PAYLOAD_OF: Record<Stage, keyof Payload> = {
  'page-cost': 'pageCost',
  shaping: 'shaping',
  rendering: 'rendering',
  'loading-time': 'loadingTime',
  'slicing-time': 'slicingTime',
}

export interface SuiteDependencies {
  resultsFile: string
  benchmarkDocument: string
  repoRoot: string
  sweepDirName: (lambdaKb: number, muKb: number) => string
  measure: {
    [S in Stage]: (ctx: SuiteContext) => Payload[(typeof PAYLOAD_OF)[S]] | Promise<Payload[(typeof PAYLOAD_OF)[S]]>
  }
  render: (results: BenchmarkResults) => void
}

const suiteDependencies: SuiteDependencies = {
  resultsFile,
  benchmarkDocument,
  repoRoot,
  sweepDirName,
  measure: {
    'page-cost': measurePageCost,
    shaping: measureShaping,
    rendering: measureRendering,
    'loading-time': measureLoadingTime,
    'slicing-time': measureSlicingTime,
  },
  render: (results) => renderBenchmark(results),
}

const previousSchema = z.looseObject({
  schemaVersion: z.literal(1),
  fonts: z.array(
    z.object({ key: z.string(), label: z.string(), file: z.string(), bytes: z.number(), sha256: z.string() }),
  ),
  stages: z.record(z.string(), z.string().nullable()),
})

const MEASURED_PATHS = ['tools/font-split']
const GENERATED_PATHS = ['tools/font-split/BENCHMARK.md', 'tools/font-split/benchmark/']

export function parsePreviousResults(json: string): BenchmarkResults {
  const parsed = previousSchema.safeParse(JSON.parse(json))
  if (!parsed.success) {
    throw new Error('not a benchmark results file', { cause: parsed.error })
  }
  return unsafeCast<BenchmarkResults>(parsed.data)
}

function readPrevious(resultsFile: string): BenchmarkResults | null {
  if (!existsSync(resultsFile)) {
    return null
  }
  try {
    return parsePreviousResults(readFileSync(resultsFile, 'utf8'))
  } catch (error) {
    throw new Error(`${resultsFile} is not a benchmark results file — delete it and run the suite again`, {
      cause: error,
    })
  }
}

function resolveFonts(options: SuiteOptions): ResolvedFont[] {
  const fonts = options.fonts.flatMap((choice) => {
    const path = isAbsolute(choice.file) ? choice.file : resolve(options.dataDir, 'fonts', choice.file)
    if (!existsSync(path)) {
      return []
    }
    return [
      {
        key: choice.key,
        label: choice.label,
        file: basename(path),
        path,
        bytes: statSync(path).size,
        sha256: hashOf(path),
      },
    ]
  })
  if (fonts.length !== options.fonts.length) {
    const missing = options.fonts.filter((choice) => !fonts.some((font) => font.key === choice.key))
    throw new Error(
      `font not found: ${missing.map((choice) => (isAbsolute(choice.file) ? choice.file : resolve(options.dataDir, 'fonts', choice.file))).join(', ')}`,
    )
  }
  return fonts
}

function recordedFonts(previous: BenchmarkResults | null): ResolvedFont[] {
  if (previous === null) {
    return []
  }
  return previous.fonts.map((font) => ({ ...font, path: '' }))
}

function hashOf(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function git(directory: string, command: string[]): string {
  const outcome = runCommand('git', command, { cwd: directory })
  return outcome.status === 0 ? outcome.stdout : ''
}

export function gitCommit(directory: string): string {
  const head = git(directory, ['rev-parse', '--short', 'HEAD']).trim()
  if (head === '') {
    return 'unknown'
  }
  const changed = git(directory, ['status', '--porcelain', '--untracked-files=all', '--', ...MEASURED_PATHS])
    .split('\n')
    .filter((line) => line !== '' && !GENERATED_PATHS.some((path) => line.slice(3).startsWith(path)))
  return changed.length === 0 ? head : `${head}-dirty`
}

function rustcVersion(directory: string): string {
  const outcome = runCommand('rustc', ['--version'], { cwd: directory })
  return outcome.status === 0 ? outcome.stdout.trim() : 'unknown'
}

function restoreSweepDirs(
  ctx: SuiteContext,
  previous: BenchmarkResults | null,
  sweepDirName: SuiteDependencies['sweepDirName'],
): void {
  for (const font of previous?.fonts ?? []) {
    const points = previous?.pageCost?.sweep?.[font.key] ?? []
    ctx.sweepDirs.set(
      font.key,
      new Map(
        points.map((point) => [
          point.lambdaKb,
          join(ctx.options.workDir, 'sweep', font.key, sweepDirName(point.lambdaKb, point.muKb)),
        ]),
      ),
    )
  }
}

export async function runFontSplitBenchmark(
  options: SuiteOptions,
  deps: SuiteDependencies = suiteDependencies,
): Promise<void> {
  const previous = readPrevious(deps.resultsFile)
  if (options.reportOnly && previous === null) {
    throw new Error(`${deps.resultsFile} is missing — run the suite once without --report-only`)
  }
  const log = (message: string): void => console.log(`==> ${message}`)
  const fonts = options.reportOnly ? recordedFonts(previous) : resolveFonts(options)
  const ctx: SuiteContext = { options, fonts, primary: fonts[0]!, sweepDirs: new Map(), log }
  const carried = new Set<Stage>(options.reportOnly ? STAGES : options.skip)
  if (previous !== null) {
    const sameFonts =
      previous.fonts.length === fonts.length &&
      previous.fonts.every((font, index) => font.sha256 === fonts[index]!.sha256)
    if (carried.size > 0 && !sameFonts) {
      throw new Error('carrying stages over from results.json needs the same fonts as that run')
    }
    restoreSweepDirs(ctx, previous, deps.sweepDirName)
  }
  const started = new Date().toISOString()
  const stages: Record<Stage, string | null> = {
    'page-cost': null,
    shaping: null,
    rendering: null,
    'loading-time': null,
    'slicing-time': null,
  }
  const kept = <T>(stage: Stage, value: T | undefined): T => {
    if (value === undefined) {
      throw new Error(`--skip ${stage} needs a previous run that measured it`)
    }
    return value
  }
  const measured: Partial<Payload> = {}
  const record = (key: keyof Payload, value: unknown): void => {
    unsafeCast<Record<string, unknown>>(measured)[key] = value
  }
  const run = async (stage: Stage): Promise<void> => {
    const key = PAYLOAD_OF[stage]
    if (carried.has(stage)) {
      stages[stage] = kept(stage, previous?.stages[stage] ?? undefined)
      record(key, kept(stage, previous?.[key]))
      return
    }
    log(stage)
    record(key, await deps.measure[stage](ctx))
    stages[stage] = started
  }
  if (options.reportOnly) {
    if (previous === null) {
      throw new Error(`${deps.resultsFile} is missing — run the suite once without --report-only`)
    }
    deps.render(previous)
    log(`redrew the charts and ${deps.benchmarkDocument} from ${deps.resultsFile}`)
    return
  }
  const commit = gitCommit(deps.repoRoot)
  const facts = {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    quick: options.quick,
    machine: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
      cpus: cpus().length,
      rustc: rustcVersion(deps.repoRoot),
      node: process.version,
    },
    fonts: fonts.map((font) => ({
      key: font.key,
      label: font.label,
      file: font.file,
      bytes: font.bytes,
      sha256: font.sha256,
    })),
  }
  try {
    for (const stage of STAGES) {
      await run(stage)
    }
  } catch (error) {
    const done = STAGES.filter((stage) => measured[PAYLOAD_OF[stage]] !== undefined)
    if (done.length > 0) {
      writeFileSync(
        deps.resultsFile,
        `${JSON.stringify({ ...facts, startedAt: started, commit, ...measured, stages }, null, 2)}\n`,
      )
      log(`kept ${done.join(', ')} in ${deps.resultsFile} — finish with --skip ${done.join(',')}`)
    }
    throw error
  }
  const complete = <K extends keyof Payload>(key: K): Payload[K] => {
    const value = measured[key]
    if (value === undefined) {
      throw new Error(`${key} was neither measured nor carried`)
    }
    return value
  }
  const results: BenchmarkResults = {
    ...facts,
    startedAt: started,
    commit,
    pageCost: complete('pageCost'),
    shaping: complete('shaping'),
    rendering: complete('rendering'),
    loadingTime: complete('loadingTime'),
    slicingTime: complete('slicingTime'),
    stages,
  }
  writeFileSync(deps.resultsFile, `${JSON.stringify(results, null, 2)}\n`)
  deps.render(results)
  log(`wrote ${deps.resultsFile}, the charts and ${deps.benchmarkDocument}`)
}
