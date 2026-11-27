import { fontSplitDir, repoRoot } from '@kobato/font-split/scripts/bench/suite/paths'
import { resolve } from 'node:path'

export const STAGES = ['page-cost', 'shaping', 'rendering', 'loading-time', 'slicing-time'] as const

export type Stage = (typeof STAGES)[number]

export interface FontChoice {
  key: string
  label: string
  file: string
}

export interface SuiteOptions {
  dataDir: string
  fonts: FontChoice[]
  workDir: string
  threads: number
  quick: boolean
  skip: readonly Stage[]
  reportOnly: boolean
  deployedPackage: string | null
}

export class UsageError extends Error {}

const DEFAULT_FONTS: readonly FontChoice[] = [
  { key: 'calendar', label: 'OPPOSerif', file: 'calendar.ttf' },
  { key: 'og', label: 'og', file: 'og.ttf' },
]
const DEFAULT_THREADS = 8

export const USAGE = `Usage: pnpm run bench:font-split [options]

Runs the font-split benchmark suite and rewrites tools/font-split/benchmark/ (charts,
results.json, deployed-package.json) and the generated blocks of BENCHMARK.md.

  --data-dir <dir>            repository data directory holding fonts/ (default: <repo>/data)
  --font <label>=<path>       benchmark this font instead of the two production fonts;
                              repeatable, the first font is the primary one
  --work-dir <dir>            scratch directory for packages and cargo targets
                              (default: tools/font-split/target/bench)
  --threads <n>               Rayon threads for slicing-time runs (default: ${DEFAULT_THREADS})
  --skip <stage,...>          skip stages: ${STAGES.join(', ')}
  --quick                     fewer samples: a smoke run of the whole pipeline
  --deployed-package <dir>    re-measure the deployed cn-font-split package in <dir> and
                              rewrite deployed-package.json
  --report-only               regenerate charts and BENCHMARK.md from results.json`

function value(argv: readonly string[], index: number, flag: string): string {
  const next = argv[index + 1]
  if (next === undefined || next.startsWith('--')) {
    throw new UsageError(`${flag} needs a value\n\n${USAGE}`)
  }
  return next
}

const isStage = (value: string): value is Stage => (STAGES as readonly string[]).includes(value)

export function parseOptions(argv: readonly string[]): SuiteOptions {
  const options: SuiteOptions = {
    dataDir: resolve(repoRoot, 'data'),
    fonts: [...DEFAULT_FONTS],
    workDir: resolve(fontSplitDir, 'target', 'bench'),
    threads: DEFAULT_THREADS,
    quick: false,
    skip: [],
    reportOnly: false,
    deployedPackage: null,
  }
  const skip = new Set<Stage>()
  const fonts: FontChoice[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!
    switch (flag) {
      case '--help':
      case '-h':
        throw new UsageError(USAGE)
      case '--':
        break
      case '--data-dir':
        options.dataDir = resolve(value(argv, index, flag))
        index += 1
        break
      case '--work-dir':
        options.workDir = resolve(value(argv, index, flag))
        index += 1
        break
      case '--threads':
        options.threads = Number(value(argv, index, flag))
        if (!Number.isInteger(options.threads) || options.threads < 1) {
          throw new UsageError(`--threads needs a positive integer\n\n${USAGE}`)
        }
        index += 1
        break
      case '--font': {
        const spec = value(argv, index, flag)
        const separator = spec.indexOf('=')
        const label = separator === -1 ? '' : spec.slice(0, separator)
        const file = separator === -1 ? spec : spec.slice(separator + 1)
        if (label === '' || file === '') {
          throw new UsageError(`--font needs <label>=<path>, got ${spec}\n\n${USAGE}`)
        }
        fonts.push({ key: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'), label, file: resolve(file) })
        index += 1
        break
      }
      case '--skip':
        for (const stage of value(argv, index, flag).split(',')) {
          if (!isStage(stage)) {
            throw new UsageError(`unknown stage ${stage}; choose from ${STAGES.join(', ')}\n\n${USAGE}`)
          }
          skip.add(stage)
        }
        index += 1
        break
      case '--deployed-package':
        options.deployedPackage = resolve(value(argv, index, flag))
        index += 1
        break
      case '--quick':
        options.quick = true
        break
      case '--report-only':
        options.reportOnly = true
        break
      default:
        throw new UsageError(`unknown argument ${flag}\n\n${USAGE}`)
    }
  }
  if (fonts.length > 0) {
    options.fonts = fonts
  }
  options.skip = STAGES.filter((stage) => skip.has(stage))
  return options
}
