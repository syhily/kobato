import type { LinkProfile } from '@kobato/font-split/scripts/bench/browser'
import type { SliceVariant } from '@kobato/font-split/scripts/bench/suite/types'

export const SWEEP_LAMBDAS_KB: readonly number[] = [20, 25, 30, 37.5, 45, 55, 60, 80, 120]
export const LOADING_LAMBDAS_KB: readonly number[] = [30, 37.5, 45, 55, 80, 120]
export const SHIPPED_LAMBDA_KB = 55
export const MU_KB = 0.5

export const LINKS: Record<'slow' | 'fast', LinkProfile> = {
  slow: { downloadBytesPerSecond: 1_600_000 / 8, uploadBytesPerSecond: 750_000 / 8, latencyMs: 150 },
  fast: { downloadBytesPerSecond: 20_000_000 / 8, uploadBytesPerSecond: 10_000_000 / 8, latencyMs: 40 },
}

export interface LoadingPlan {
  protocol: 'h1' | 'h2'
  link: 'slow' | 'fast'
  pairs: number
}

export const LOADING_CONDITIONS: readonly Omit<LoadingPlan, 'pairs'>[] = [
  { protocol: 'h1', link: 'slow' },
  { protocol: 'h1', link: 'fast' },
  { protocol: 'h2', link: 'slow' },
  { protocol: 'h2', link: 'fast' },
]

export function conditionName(protocol: 'h1' | 'h2', link: 'slow' | 'fast'): string {
  return `HTTP/${protocol === 'h1' ? '1.1' : '2'} ${link}`
}

export function loadingPlan(quick: boolean): LoadingPlan[] {
  const pairs = quick ? { slow: 1, fast: 2 } : { slow: 4, fast: 10 }
  return LOADING_CONDITIONS.map((condition) => ({
    protocol: condition.protocol,
    link: condition.link,
    pairs: pairs[condition.link],
  }))
}

export interface RenderingString {
  text: string
  note: string
}

export const RENDERING_STRINGS: readonly RenderingString[] = [
  { text: 'To Tale Av Way WA LT P. T, V', note: '' },
  { text: 'AVAWA Ta Vo We Yo PA We', note: '' },
  { text: 'Office flow waffle fish fi fl', note: '' },
  { text: '\u0065\u0301 \u0061\u0301 \u006E\u0303 \u006F\u0308 \u0041\u0300', note: 'combining marks' },
  { text: 'Ångström naïve café', note: '' },
  { text: '中文测试，标点。「引用」', note: '' },
  { text: '2026-11-26 Kobato', note: '' },
]

export const SLICE_RUNS = 5
export const SLICE_RUNS_SECONDARY = 3
export const SLICE_RUNS_QUICK = 2
export const PGO_BUILDS = 3
export const PGO_BUILDS_QUICK = 1

export const SLICE_VARIANTS_PRIMARY: readonly SliceVariant[] = [
  'shipped',
  'previous-profile',
  'pgo',
  'q10',
  'q9',
  'q8',
  'raw',
]
export const SLICE_VARIANTS_SECONDARY: readonly SliceVariant[] = ['shipped', 'q10', 'q9', 'q8']

export interface SliceVariantSpec {
  variant: SliceVariant
  label: string
  addon: 'shipped' | 'bench' | 'previous-profile' | 'pgo'
  quality: number | null
  skipCompression: boolean
}

export const SLICE_VARIANT_SPECS: Record<SliceVariant, SliceVariantSpec> = {
  shipped: {
    variant: 'shipped',
    label: 'Subsetting + WOFF2 quality 11, shipped build',
    addon: 'shipped',
    quality: null,
    skipCompression: false,
  },
  'previous-profile': {
    variant: 'previous-profile',
    label: 'WOFF2 quality 11, fat LTO with default codegen units, unstripped',
    addon: 'previous-profile',
    quality: null,
    skipCompression: false,
  },
  pgo: {
    variant: 'pgo',
    label: 'WOFF2 quality 11, shipped build + profile-guided optimization',
    addon: 'pgo',
    quality: null,
    skipCompression: false,
  },
  q10: { variant: 'q10', label: 'WOFF2 quality 10', addon: 'bench', quality: 10, skipCompression: false },
  q9: { variant: 'q9', label: 'WOFF2 quality 9', addon: 'bench', quality: 9, skipCompression: false },
  q8: { variant: 'q8', label: 'WOFF2 quality 8', addon: 'bench', quality: 8, skipCompression: false },
  raw: {
    variant: 'raw',
    label: 'Subsetting only (no WOFF2 compression)',
    addon: 'bench',
    quality: null,
    skipCompression: true,
  },
}
