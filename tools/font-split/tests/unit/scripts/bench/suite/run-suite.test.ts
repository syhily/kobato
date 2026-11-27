import type { Stage, SuiteOptions } from '@kobato/font-split/scripts/bench/suite/options'
import type { SuiteDependencies } from '@kobato/font-split/scripts/bench/suite/run'
import type { BenchmarkResults } from '@kobato/font-split/scripts/bench/suite/types'

import { runFontSplitBenchmark } from '@kobato/font-split/scripts/bench/suite/run'
import { syntheticResults } from '@kobato/font-split/tests/unit/scripts/bench/results-fixture'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

interface Harness {
  root: string
  deps: SuiteDependencies
  renders: BenchmarkResults[]
}

const roots: string[] = []

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'kobato-bench-suite-'))
  roots.push(root)
  mkdirSync(join(root, 'fonts'))
  mkdirSync(join(root, 'benchmark'))
  writeFileSync(join(root, 'fonts', 'calendar.ttf'), 'not a font')
  return root
}

function harness(root: string, measure: Partial<SuiteDependencies['measure']> = {}): Harness {
  const fixture = syntheticResults()
  if (fixture.loadingTime === null || fixture.slicingTime === null) {
    throw new Error('the fixture measures every stage')
  }
  const measured =
    <T>(value: T): (() => T) =>
    () =>
      value
  const renders: BenchmarkResults[] = []
  const deps: SuiteDependencies = {
    resultsFile: join(root, 'benchmark', 'results.json'),
    benchmarkDocument: join(root, 'BENCHMARK.md'),
    repoRoot: root,
    sweepDirName: (lambdaKb) => `l${lambdaKb}`,
    measure: {
      'page-cost': measured(fixture.pageCost),
      shaping: measured(fixture.shaping),
      rendering: measured(fixture.rendering),
      'loading-time': measured(fixture.loadingTime),
      'slicing-time': measured(fixture.slicingTime),
      ...measure,
    },
    render: (results) => {
      renders.push(results)
    },
  }
  return { root, deps, renders }
}

const options = (root: string, skip: readonly Stage[] = []): SuiteOptions => ({
  dataDir: root,
  fonts: [{ key: 'calendar', label: 'OPPOSerif', file: 'calendar.ttf' }],
  workDir: join(root, 'work'),
  threads: 8,
  quick: false,
  skip,
  reportOnly: false,
  deployedPackage: null,
})

const saved = (deps: SuiteDependencies): Record<string, unknown> => JSON.parse(readFileSync(deps.resultsFile, 'utf8'))

describe('the font-split benchmark suite', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes every stage and renders the document once', async () => {
    const root = scratch()
    const { deps, renders } = harness(root)
    await runFontSplitBenchmark(options(root), deps)
    const results = saved(deps)
    expect(results.commit).toBe('unknown')
    expect(results.stages).toEqual({
      'page-cost': results.startedAt,
      shaping: results.startedAt,
      rendering: results.startedAt,
      'loading-time': results.startedAt,
      'slicing-time': results.startedAt,
    })
    expect(results.fonts).toEqual([
      {
        key: 'calendar',
        label: 'OPPOSerif',
        file: 'calendar.ttf',
        bytes: 10,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ])
    expect(renders).toHaveLength(1)
    expect(existsSync(deps.benchmarkDocument)).toBe(false)
  })

  it('keeps what it measured before a stage failed and finishes from there', async () => {
    const root = scratch()
    const failing = harness(root, {
      'slicing-time': () => {
        throw new Error('the machine was busy')
      },
    })
    await expect(runFontSplitBenchmark(options(root), failing.deps)).rejects.toThrow(/the machine was busy/)
    const checkpoint = saved(failing.deps)
    expect(checkpoint.slicingTime).toBeUndefined()
    expect(checkpoint.stages).toMatchObject({ 'page-cost': checkpoint.startedAt, 'slicing-time': null })
    expect(failing.renders).toHaveLength(0)

    const finishing = harness(root)
    await runFontSplitBenchmark(options(root, ['page-cost', 'shaping', 'rendering', 'loading-time']), finishing.deps)
    const results = saved(finishing.deps) as { slicingTime: unknown; stages: Record<string, string> }
    expect(results.slicingTime).toEqual(syntheticResults().slicingTime)
    expect(results.stages['slicing-time']).not.toBe(results.stages['page-cost'])
    expect(finishing.renders).toHaveLength(1)
  })

  it('leaves no results behind when the first stage fails', async () => {
    const root = scratch()
    const failing = harness(root, {
      'page-cost': () => {
        throw new Error('no font')
      },
    })
    await expect(runFontSplitBenchmark(options(root), failing.deps)).rejects.toThrow(/no font/)
    expect(existsSync(failing.deps.resultsFile)).toBe(false)
    expect(failing.renders).toHaveLength(0)
  })
})
