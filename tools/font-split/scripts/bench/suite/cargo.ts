import type {
  CorpusReports,
  PageCostReport,
  ShapingRelation,
  ShapingResult,
  SlicePhases,
  SliceSample,
  SweepPoint,
} from '@kobato/font-split/scripts/bench/suite/types'

import { runCommandOrThrow } from '@kobato/font-split/scripts/bench/command'
import {
  recordNumber,
  recordString,
  recordsOf,
  selectRecords,
  theRecord,
} from '@kobato/font-split/scripts/bench/records'
import { fontSplitDir } from '@kobato/font-split/scripts/bench/suite/paths'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CORPORA = ['hans', 'hant', 'blog'] as const
const PACKAGE = 'kobato-font-split'

export const SEAM_VARIABLES = ['FONT_SPLIT_BENCH_WOFF2_QUALITY', 'FONT_SPLIT_BENCH_SKIP_COMPRESSION'] as const

function harness(target: string, test: string, env: NodeJS.ProcessEnv): string {
  const args = [
    'test',
    '--release',
    '--features',
    'bench',
    '--test',
    target,
    test,
    '--',
    '--ignored',
    '--nocapture',
    '--test-threads=1',
  ]
  const clean = Object.fromEntries(SEAM_VARIABLES.map((name) => [name, undefined]))
  return runCommandOrThrow('cargo', args, { cwd: fontSplitDir, env: { ...clean, ...env } }).stdout
}

function pageCost(records: ReturnType<typeof recordsOf>, match: Readonly<Record<string, string>>): PageCostReport {
  const report = theRecord(records, 'page-cost', match)
  const bands = selectRecords(records, 'page-cost-size', match)
  return {
    chunks: recordNumber(report, 'chunks'),
    totalBytes: recordNumber(report, 'totalBytes'),
    cssBytes: recordNumber(report, 'cssBytes'),
    pages: recordNumber(report, 'pages'),
    coldMeanBytes: recordNumber(report, 'cold.meanBytes'),
    coldP90Bytes: recordNumber(report, 'cold.p90Bytes'),
    coldMeanChunks: recordNumber(report, 'cold.meanChunks'),
    coldP90Chunks: recordNumber(report, 'cold.p90Chunks'),
    coldMaxChunks: recordNumber(report, 'cold.maxChunks'),
    sessionMeanBytes: recordNumber(report, 'session.meanBytes'),
    sessionMeanChunks: recordNumber(report, 'session.meanChunks'),
    incrementalMeanBytes: recordNumber(report, 'incremental.meanBytes'),
    nextMeanBytes: recordNumber(report, 'next.meanBytes'),
    nextMeanChunks: recordNumber(report, 'next.meanChunks'),
    bySize: bands.map((band) => ({
      band: recordString(band, 'band'),
      pages: recordNumber(band, 'pages'),
      meanBytes: recordNumber(band, 'meanBytes'),
      meanChunks: recordNumber(band, 'meanChunks'),
    })),
  }
}

function corpora(records: ReturnType<typeof recordsOf>, extra: Readonly<Record<string, string>> = {}): CorpusReports {
  return {
    hans: pageCost(records, { label: 'hans', ...extra }),
    hant: pageCost(records, { label: 'hant', ...extra }),
    blog: pageCost(records, { label: 'blog', ...extra }),
  }
}

export function runFixtureBaseline(): CorpusReports {
  return corpora(recordsOf(harness('page_cost', 'page_cost_baseline_is_pinned', {})))
}

export function runSweep(
  fontPath: string,
  lambdasBytes: readonly number[],
  muBytes: number,
  outDir: string | null,
): SweepPoint[] {
  const stdout = harness('page_cost', 'page_cost_lambda_sweep', {
    FONT_SPLIT_BENCH_FONT: fontPath,
    FONT_SPLIT_SWEEP_LAMBDA_BYTES: lambdasBytes.join(','),
    FONT_SPLIT_SWEEP_MU_BYTES: String(muBytes),
    ...(outDir === null ? {} : { FONT_SPLIT_BENCH_OUT_DIR: outDir }),
  })
  const records = recordsOf(stdout)
  return lambdasBytes.map((lambda) => {
    const point = { lambda: String(lambda), mu: String(muBytes) }
    if (selectRecords(records, 'page-cost', point).length !== CORPORA.length) {
      throw new Error(`the λ=${lambda} sweep point did not report its three corpora`)
    }
    return { lambdaKb: lambda / 1000, muKb: muBytes / 1000, corpora: corpora(records, point) }
  })
}

export function runPageCostReport(fontPath: string, packageDir: string): CorpusReports {
  const stdout = harness('page_cost', 'page_cost_font_report', {
    FONT_SPLIT_BENCH_FONT: fontPath,
    FONT_SPLIT_BENCH_PACKAGE: packageDir,
  })
  return corpora(recordsOf(stdout))
}

export function runShaping(fontPath: string, packageDir: string): ShapingResult {
  const stdout = harness('shaping_colocation', 'shaping_colocation_report', {
    FONT_SPLIT_BENCH_FONT: fontPath,
    FONT_SPLIT_BENCH_PACKAGE: packageDir,
  })
  const record = theRecord(recordsOf(stdout, 'shaping'), 'shaping', {})
  const relation = (kind: string): ShapingRelation => {
    const found = theRecord(recordsOf(stdout, 'shaping-relation'), 'shaping-relation', { kind })
    return { relations: recordNumber(found, 'relations'), colocated: recordNumber(found, 'colocated') }
  }
  return {
    codepoints: recordNumber(record, 'codepoints'),
    glyphs: recordNumber(record, 'glyphs'),
    sharedGlyphs: recordNumber(record, 'sharedGlyphs'),
    faces: recordNumber(record, 'faces'),
    pairSubtables: recordNumber(record, 'pairSubtables'),
    markSubtables: recordNumber(record, 'markSubtables'),
    extensionSubtables: recordNumber(record, 'extensionSubtables'),
    largestFaceBytes: recordNumber(record, 'largestFaceBytes'),
    largestFaceCodepoints: recordNumber(record, 'largestFaceCodepoints'),
    largestFaceAscii: recordNumber(record, 'largestFaceAscii'),
    facesWithoutIdeograph: recordNumber(record, 'facesWithoutIdeograph'),
    kernAscii: relation('kern-ascii'),
    kernMapped: relation('kern-mapped'),
    markBase: relation('mark-base'),
    ligature: relation('ligature'),
  }
}

export function runSlicingPhases(
  fontPath: string,
  threads: number,
  env: NodeJS.ProcessEnv = {},
): { sample: SliceSample; phases: SlicePhases } {
  const args = [
    'test',
    '--release',
    '--test',
    'slicing_time',
    'slicing_time_report',
    '--',
    '--ignored',
    '--nocapture',
    '--test-threads=1',
  ]
  const clean = Object.fromEntries(SEAM_VARIABLES.map((name) => [name, undefined]))
  const outcome = runCommandOrThrow('cargo', args, {
    cwd: fontSplitDir,
    env: {
      ...clean,
      ...env,
      RAYON_NUM_THREADS: String(threads),
      FONT_SPLIT_BENCH_FONT: fontPath,
      FONT_SPLIT_BENCH_PHASES: '1',
    },
  })
  const stdout = outcome.stdout
  const timed = theRecord(recordsOf(stdout, 'slicing-time'), 'slicing-time', {})
  const phase = theRecord(recordsOf(stdout, 'slicing-phase'), 'slicing-phase', {})
  const faces = selectRecords(recordsOf(stdout), 'slicing-face', {})
  if (faces.length === 0) {
    throw new Error('the slicing-time harness reported no per-face timings')
  }
  const largest = faces.reduce((top, face) => (recordNumber(face, 'bytes') > recordNumber(top, 'bytes') ? face : top))
  return {
    sample: {
      ms: recordNumber(timed, 'ms'),
      chunks: recordNumber(timed, 'chunks'),
      chunkBytes: recordNumber(timed, 'chunkBytes'),
      cssBytes: recordNumber(timed, 'cssBytes'),
      largestFaceBytes: recordNumber(timed, 'largestFaceBytes'),
      namesHash: '',
    },
    phases: {
      preSubsetMs: recordNumber(phase, 'preSubsetMs'),
      runSubsetMs: recordNumber(phase, 'runSubsetMs'),
      linkSubsetMs: recordNumber(phase, 'linkSubsetMs'),
      faces: recordNumber(phase, 'faces'),
      largestFaceBytes: recordNumber(largest, 'bytes'),
      largestFaceMs: recordNumber(largest, 'ms'),
    },
  }
}

export interface AddonBuild {
  targetDir: string
  features: string[]
  env: NodeJS.ProcessEnv
  fresh: boolean
}

const DYLIB_EXTENSIONS = ['.dylib', '.so', '.dll']

export function buildAddon(build: AddonBuild): string {
  const environment = { ...build.env, CARGO_TARGET_DIR: build.targetDir }
  if (build.fresh) {
    runCommandOrThrow('cargo', ['clean', '--release', '-p', PACKAGE], { cwd: fontSplitDir, env: environment })
  }
  runCommandOrThrow(
    'cargo',
    [
      'build',
      '--release',
      '--locked',
      ...(build.features.length === 0 ? [] : ['--features', build.features.join(',')]),
    ],
    { cwd: fontSplitDir, env: environment },
  )
  for (const extension of DYLIB_EXTENSIONS) {
    const candidate = join(build.targetDir, 'release', `kobato_font_split${extension}`)
    const prefixed = join(build.targetDir, 'release', `libkobato_font_split${extension}`)
    for (const path of [candidate, prefixed]) {
      if (existsSync(path)) {
        return path
      }
    }
  }
  throw new Error(`cargo built no font-split library in ${build.targetDir}`)
}

export function fileBytes(path: string): number {
  return statSync(path).size
}
