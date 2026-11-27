import type {
  BenchmarkResults,
  CorpusReports,
  PageCostReport,
  SliceVariant,
  SweepPoint,
} from '@kobato/font-split/scripts/bench/suite/types'

import { SHIPPED_LAMBDA_KB, SWEEP_LAMBDAS_KB } from '@kobato/font-split/scripts/bench/suite/profile'

const BANDS = [
  { band: '<300', pages: 40, bytes: 1_376_256, chunks: 38.1 },
  { band: '300-399', pages: 74, bytes: 1_716_224, chunks: 57 },
  { band: '400-499', pages: 72, bytes: 1_832_960, chunks: 64.9 },
  { band: '500-699', pages: 35, bytes: 2_038_784, chunks: 76.1 },
  { band: '700+', pages: 13, bytes: 2_351_104, chunks: 96.8 },
]

export function report(scale = 1): PageCostReport {
  return {
    chunks: 707,
    totalBytes: 25_366_020,
    cssBytes: 286_018,
    pages: 234,
    coldMeanBytes: 1_778_066 * scale,
    coldP90Bytes: 2_320_172 * scale,
    coldMeanChunks: 61.3,
    coldP90Chunks: 88,
    coldMaxChunks: 154,
    sessionMeanBytes: 3_162_385 * scale,
    sessionMeanChunks: 137,
    incrementalMeanBytes: 494_727 * scale,
    nextMeanBytes: 504_066 * scale,
    nextMeanChunks: 29.5,
    bySize: BANDS.map((band) => ({
      band: band.band,
      pages: band.pages,
      meanBytes: band.bytes * scale,
      meanChunks: band.chunks,
    })),
  }
}

export function corpora(): CorpusReports {
  return { hans: report(0.98), hant: report(1.34), blog: report(1) }
}

export function sweepPoint(lambdaKb: number): SweepPoint {
  const drift = SHIPPED_LAMBDA_KB - lambdaKb
  const at = (scale: number): PageCostReport => {
    const base = report(scale)
    return {
      ...base,
      chunks: 707 + Math.round(drift * 2.8),
      coldMeanBytes: base.coldMeanBytes - drift * 4000,
      coldMeanChunks: base.coldMeanChunks + drift * 0.36,
      nextMeanBytes: base.nextMeanBytes + drift * 1500,
      nextMeanChunks: base.nextMeanChunks + drift * 0.38,
    }
  }
  return { lambdaKb, muKb: 0.5, corpora: { hans: at(0.98), hant: at(1.34), blog: at(1) } }
}

export function syntheticResults(): BenchmarkResults {
  const fonts = [
    { key: 'calendar', label: 'OPPOSerif', file: 'calendar.ttf', bytes: 40_144_936, sha256: 'a'.repeat(64) },
    { key: 'og', label: 'og', file: 'og.ttf', bytes: 22_741_096, sha256: 'b'.repeat(64) },
  ]
  const shaping = {
    codepoints: 29_251,
    glyphs: 29_469,
    sharedGlyphs: 0,
    faces: 707,
    pairSubtables: 14,
    markSubtables: 5,
    extensionSubtables: 19,
    largestFaceBytes: 118_672,
    largestFaceCodepoints: 856,
    largestFaceAscii: 95,
    facesWithoutIdeograph: 16,
    kernAscii: { relations: 1522, colocated: 1522 },
    kernMapped: { relations: 145_800, colocated: 145_800 },
    markBase: { relations: 14_328, colocated: 14_328 },
    ligature: { relations: 36, colocated: 36 },
  }
  const strings = ['To Tale Av Way WA LT P. T, V', 'AVAWA Ta Vo We Yo PA We']
  const renderingRow = (text: string, index: number) => ({
    text,
    note: '',
    originalWidth: 614.1 + index,
    packageWidth: 614.1 + index,
    identical: true,
    differingPixels: 0,
    packageFaces: 1,
  })
  const lambdas = [30, 37.5, 45, 55, 80, 120]
  const addonBytes = (variant: SliceVariant): number =>
    variant === 'previous-profile' ? 4_739_640 : variant === 'pgo' ? 3_671_224 : 3_708_128
  const sample = (ms: number, variant: SliceVariant, build: number | null = null) => ({
    variant,
    build,
    addonBytes: addonBytes(variant),
    samples: [
      {
        ms,
        chunks: 707,
        chunkBytes: 25_366_020,
        cssBytes: 280_239,
        largestFaceBytes: 118_672,
        namesHash: '439438b5eda1',
      },
      {
        ms: ms + 200,
        chunks: 707,
        chunkBytes: 25_366_020,
        cssBytes: 280_239,
        largestFaceBytes: 118_672,
        namesHash: '439438b5eda1',
      },
    ],
  })
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-27T10:00:00.000Z',
    startedAt: '2026-11-27T10:00:00.000Z',
    commit: 'abc1234',
    quick: false,
    machine: { platform: 'darwin', arch: 'x64', cpu: 'Test CPU', cpus: 36, rustc: 'rustc 1.100.0', node: 'v26.13.1' },
    fonts,
    pageCost: {
      fixture: corpora(),
      sweep: {
        calendar: SWEEP_LAMBDAS_KB.map(sweepPoint),
        og: [sweepPoint(SHIPPED_LAMBDA_KB)],
      },
      deployed: {
        measured: '2026-11-27',
        source: 'cn-font-split 7.6.8 wasm core',
        font: { file: 'calendar.ttf', sha256: 'a'.repeat(64) },
        chunks: 655,
        chunkBytes: 30_323_800,
        cssBytes: 243_421,
        corpora: {
          hans: report(1.62),
          hant: report(2.34),
          blog: report(1.48),
        },
      },
    },
    shaping: { calendar: shaping, og: { ...shaping, faces: 439, largestFaceBytes: 82_352, largestFaceAscii: 0 } },
    rendering: {
      calendar: strings.map(renderingRow),
      og: strings.map(renderingRow),
    },
    loadingTime: {
      browser: '158.0.8127.89',
      lambdasKb: lambdas,
      links: {
        slow: { downloadBytesPerSecond: 200_000, uploadBytesPerSecond: 93_750, latencyMs: 150 },
        fast: { downloadBytesPerSecond: 2_500_000, uploadBytesPerSecond: 1_250_000, latencyMs: 40 },
      },
      pairsPerLink: { slow: 2, fast: 2 },
      conditions: (['h1', 'h2'] as const).flatMap((protocol) =>
        (['slow', 'fast'] as const).map((link) => ({
          protocol,
          link,
          pairs: [0, 1].map((index) => ({
            index,
            coldPage: index,
            nextPage: index + 1,
            runs: Object.fromEntries(
              lambdas.map((lambdaKb, at) => {
                const point = sweepPoint(lambdaKb).corpora.blog
                const newBytes = point.nextMeanBytes - 100_000 * index
                return [
                  String(lambdaKb),
                  {
                    coldMs: point.coldMeanBytes / 200 + point.coldMeanChunks * 7 + index * 40 + at,
                    coldFaces: Math.round(point.coldMeanChunks),
                    coldBytes: point.coldMeanBytes,
                    nextMs: newBytes / 200 + point.nextMeanChunks * 7 + index * 20 + at,
                    nextNewFaces: Math.round(point.nextMeanChunks),
                    nextNewBytes: newBytes,
                    nextCachedFaces: 30,
                  },
                ]
              }),
            ),
          })),
        })),
      ),
    },
    slicingTime: {
      threads: 8,
      fingerprint: '1dca6e172640',
      profdata: 'Homebrew LLVM version 23.1.6',
      fonts: {
        calendar: {
          variants: [
            sample(240, 'raw'),
            sample(830, 'q8'),
            sample(950, 'q9'),
            sample(8010, 'q10'),
            sample(15_420, 'previous-profile'),
            sample(14_960, 'shipped'),
            sample(13_700, 'pgo', 1),
            sample(15_600, 'pgo', 2),
          ],
          phases: {
            preSubsetMs: 448.5,
            runSubsetMs: 12_377.7,
            linkSubsetMs: 5,
            faces: 707,
            largestFaceBytes: 118_672,
            largestFaceMs: 1204,
          },
        },
        og: { variants: [sample(7400, 'shipped'), sample(3720, 'q10')], phases: null },
      },
    },
    stages: {
      'page-cost': '2026-11-27T10:00:00.000Z',
      shaping: '2026-11-27T10:00:00.000Z',
      rendering: '2026-11-27T10:00:00.000Z',
      'loading-time': '2026-11-27T10:00:00.000Z',
      'slicing-time': '2026-11-26T09:00:00.000Z',
    },
  }
}
