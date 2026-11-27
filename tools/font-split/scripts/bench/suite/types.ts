import type { LinkProfile } from '@kobato/font-split/scripts/bench/browser'
import type { Stage, SuiteOptions } from '@kobato/font-split/scripts/bench/suite/options'

export type Corpus = 'hans' | 'hant' | 'blog'

export interface SizeBand {
  band: string
  pages: number
  meanBytes: number
  meanChunks: number
}

export interface PageCostReport {
  chunks: number
  totalBytes: number
  cssBytes: number
  pages: number
  coldMeanBytes: number
  coldP90Bytes: number
  coldMeanChunks: number
  coldP90Chunks: number
  coldMaxChunks: number
  sessionMeanBytes: number
  sessionMeanChunks: number
  incrementalMeanBytes: number
  nextMeanBytes: number
  nextMeanChunks: number
  bySize: SizeBand[]
}

export type CorpusReports = Record<Corpus, PageCostReport>

export interface SweepPoint {
  lambdaKb: number
  muKb: number
  corpora: CorpusReports
}

export interface FontSpec {
  key: string
  label: string
  file: string
  bytes: number
  sha256: string
}

export interface ResolvedFont extends FontSpec {
  path: string
}

export interface ShapingRelation {
  relations: number
  colocated: number
}

export interface ShapingResult {
  codepoints: number
  glyphs: number
  sharedGlyphs: number
  faces: number
  pairSubtables: number
  markSubtables: number
  extensionSubtables: number
  largestFaceBytes: number
  largestFaceCodepoints: number
  largestFaceAscii: number
  facesWithoutIdeograph: number
  kernAscii: ShapingRelation
  kernMapped: ShapingRelation
  markBase: ShapingRelation
  ligature: ShapingRelation
}

export interface RenderingRow {
  text: string
  note: string
  originalWidth: number
  packageWidth: number
  identical: boolean
  differingPixels: number
  packageFaces: number
}

export interface LoadingRun {
  coldMs: number
  coldFaces: number
  coldBytes: number
  nextMs: number
  nextNewFaces: number
  nextNewBytes: number
  nextCachedFaces: number
}

export interface LoadingPair {
  index: number
  coldPage: number
  nextPage: number
  runs: Record<string, LoadingRun>
}

export interface LoadingCondition {
  protocol: 'h1' | 'h2'
  link: 'slow' | 'fast'
  pairs: LoadingPair[]
}

export interface LoadingTimeResult {
  browser: string
  lambdasKb: number[]
  links: Record<'slow' | 'fast', LinkProfile>
  pairsPerLink: Record<'slow' | 'fast', number>
  conditions: LoadingCondition[]
}

export type SliceVariant = 'raw' | 'q8' | 'q9' | 'q10' | 'shipped' | 'previous-profile' | 'pgo'

export interface SliceSample {
  ms: number
  chunks: number
  chunkBytes: number
  cssBytes: number
  largestFaceBytes: number
  namesHash: string
}

export interface SliceVariantResult {
  variant: SliceVariant
  build: number | null
  addonBytes: number | null
  samples: SliceSample[]
}

export interface SlicePhases {
  preSubsetMs: number
  runSubsetMs: number
  linkSubsetMs: number
  faces: number
  largestFaceBytes: number
  largestFaceMs: number
}

export interface SlicingTimeResult {
  threads: number
  fingerprint: string
  profdata: string | null
  fonts: Record<string, { variants: SliceVariantResult[]; phases: SlicePhases | null }>
}

export interface DeployedPackage {
  measured: string
  source: string
  font: { file: string; sha256: string }
  chunks: number
  chunkBytes: number
  cssBytes: number
  corpora: CorpusReports
}

export interface BenchmarkMachine {
  platform: string
  arch: string
  cpu: string
  cpus: number
  rustc: string
  node: string
}

export interface BenchmarkResults {
  schemaVersion: 1
  generatedAt: string
  startedAt: string
  commit: string
  quick: boolean
  machine: BenchmarkMachine
  fonts: FontSpec[]
  pageCost: { fixture: CorpusReports; sweep: Record<string, SweepPoint[]>; deployed: DeployedPackage }
  shaping: Record<string, ShapingResult>
  rendering: Record<string, RenderingRow[]>
  loadingTime: LoadingTimeResult | null
  slicingTime: SlicingTimeResult | null
  stages: Record<Stage, string | null>
}

export interface SuiteContext {
  options: SuiteOptions
  fonts: ResolvedFont[]
  primary: ResolvedFont
  sweepDirs: Map<string, Map<number, string>>
  log(message: string): void
}
