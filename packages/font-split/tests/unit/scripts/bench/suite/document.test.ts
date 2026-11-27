import { escapeCell, replaceBlocks } from '@kobato/font-split/scripts/bench/markdown'
import { renderBlocks } from '@kobato/font-split/scripts/bench/suite/document'
import { percent } from '@kobato/font-split/scripts/bench/suite/format'
import { benchmarkDocument } from '@kobato/font-split/scripts/bench/suite/paths'
import { syntheticResults } from '@kobato/font-split/tests/unit/scripts/bench/results-fixture'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const BLOCKS = [
  'header',
  'parameters',
  'shipped-vs-deployed',
  'corpora',
  'package-facts',
  'shaping-colocation',
  'rendering',
  'frontier',
  'by-page-size',
  'loading-time',
  'loading-model',
  'decision',
  'fixture-baseline',
  'costs',
  'slicing-time',
]

describe('font-split benchmark document', () => {
  it('produces every block the document carries', () => {
    const blocks = renderBlocks(syntheticResults())
    expect(Object.keys(blocks)).toEqual(BLOCKS)
    for (const [name, block] of Object.entries(blocks)) {
      expect(block.length, name).toBeGreaterThan(20)
      expect(block, name).not.toMatch(/NaN|undefined|Infinity/)
    }
    const document = readFileSync(benchmarkDocument, 'utf8')
    expect(() => replaceBlocks(document, blocks)).not.toThrow()
  })

  it('states the run facts and the shipped comparison', () => {
    const blocks = renderBlocks(syntheticResults())
    expect(blocks.header).toContain('Measured **2026-11-27** on commit `abc1234`')
    expect(blocks.header).toContain('Algorithm fingerprint `1dca6e172640`')
    expect(blocks.header).toContain('Carried over from earlier runs: slicing-time (2026-11-26)')
    expect(blocks['shipped-vs-deployed']).toContain('| Cold page | 2,570 KB | 1,736 KB | −32% |')
    expect(blocks['shipped-vs-deployed']).toContain('| Package (chunks + CSS) | 30.57 MB | 25.65 MB | −16% |')
    expect(blocks['shipped-vs-deployed']).toContain('| result.css with the family name | 238 KB | 274 KB | +15% |')
    expect(blocks.corpora).toContain(
      '| wiki hans | 2,813 / 61.3 | 1,702 / 61.3 | 797 KB / 29.5 req | 482 KB / 29.5 req |',
    )
    expect(blocks['package-facts']).toContain('16 of the 707 faces contain no ideograph')
    expect(blocks.parameters).toContain(
      'slow link 1.6 Mbps down, 0.75 up, 150 ms latency; fast link 20 Mbps down, 10 up, 40 ms latency.',
    )
    expect(blocks.parameters).toContain(
      '2 page pairs per point on the slow link and 2 page pairs on the fast link; 2 interleaved slicing runs per variant (2 for the second font) at 8 Rayon threads.',
    )
  })

  it('reports shaping, rendering and the λ frontier', () => {
    const blocks = renderBlocks(syntheticResults())
    expect(blocks['shaping-colocation']).toContain(
      '| Kern pairs with a non-zero adjustment, both glyphs ASCII (1,522 / 1,522) | 100% | 100% |',
    )
    expect(blocks['shaping-colocation']).toContain('OPPOSerif carries 14 pair-positioning and 5 mark-to-base subtables')
    expect(blocks.rendering).toContain(
      '| `To Tale Av Way WA LT P. T, V` | 614.1 px | pixel-identical | pixel-identical |',
    )
    expect(blocks.frontier).toContain(
      '| **55** | 707 | 1,736 / 61.3 | 88 / 154 | 492 / 29.5 | 1,702 / 61.3 | 2,327 / 61.3 |',
    )
    expect(blocks.frontier).toMatch(/Between λ=30 KB and λ=55 KB every request saved costs [0-9.]+ KB\./)
    expect(blocks.frontier).toMatch(/λ=60 KB changes the package by [0-9.]+ requests and [0-9,]+ KB per page\./)
    expect(blocks['by-page-size']).toContain(
      '| 300–399 | 74 | 2,480 KB / 57.0 req | 1,676 KB / 57.0 req | 1,676 KB / 57.0 req | 1,676 KB / 57.0 req |',
    )
    expect(blocks['by-page-size']).toMatch(
      /^Against the deployed package every size band changes its bytes by −32\.4%; /,
    )
  })

  it('tabulates the loading times, their model and the decision', () => {
    const blocks = renderBlocks(syntheticResults())
    expect(blocks['loading-time']).toContain(
      '| Cold page | H1 | slow | 2 | 1.000 | 1.015 | 1.030 | 1.049 | 1.099 | 1.177 |',
    )
    expect(blocks['loading-time'].split('\n')).toHaveLength(10)
    expect(blocks['loading-model']).toContain('| slow | H1 | 5.09 | 6.8 | 1.000 |')
    expect(blocks['loading-model']).toContain('A request costs 6.8 ms on HTTP/1.1 (six connections)')
    expect(blocks.decision).toContain(
      '**λ=55 KB, μ=0.5 KB.** From λ=45 KB to λ=55 KB the cold page moves by +1.9% and the next page by −3.9% for 3.6 fewer requests per cold page (64.9 vs 61.3) and 39 KB (+2.3%) more bytes.',
    )
    expect(blocks.decision).toContain('The rationale and the rejected alternatives are recorded in ADR-0010.')
  })

  it('lists the costs and the slicing variants', () => {
    const blocks = renderBlocks(syntheticResults())
    expect(blocks.costs).toContain('**Slicing time, OPPOSerif**: 15.06 s for the 38.3 MiB font at 8 Rayon threads.')
    expect(blocks.costs).toContain(
      'A separate phase-timed run (12.83 s) spends 0.45 s on partitioning with the byte probes, 12.38 s on subsetting ' +
        'and WOFF2 compression and 5 ms on the CSS; the largest face (116 KB) alone compresses in 1,204 ms.',
    )
    expect(blocks.costs).toContain('Subsetting without WOFF2 compression takes 0.34 s (2% of the shipped time).')
    expect(blocks.costs).toContain(
      '**Release profile** (fat LTO, one codegen unit, stripped): the addon is 3.71 MB against 4.74 MB (−22%) with ' +
        'default codegen units and symbols kept; slicing takes 15.06 s against 15.52 s.',
    )
    expect(blocks.costs).toContain(
      '**Profile-guided optimization**: 2 independent training runs and builds measure 13.80 s (−8%; 13.70–13.90 s) and ' +
        '15.70 s (+4%; 15.60–15.80 s) against the shipped 15.06 s (14.96–15.16 s over the interleaved runs), trained on ' +
        'the benchmark fonts; Homebrew LLVM version 23.1.6 — from one training run to the next its effect spans −8.4% ' +
        'to +4.2%.',
    )
    expect(blocks.costs).toContain('**Algorithm fingerprint** `1dca6e172640`')
    expect(blocks['slicing-time']).toContain('Slicing time (8 threads), median (min–max)')
    expect(blocks['slicing-time']).toContain(
      '| **WOFF2 quality 11, fat LTO + codegen-units = 1 + strip** | 15.06 s (14.96–15.16) | 3.71 MB | 25.37 MB | 707 |',
    )
    expect(blocks['slicing-time']).toContain(
      '| WOFF2 quality 11, shipped build + profile-guided optimization, training run 1 | 13.80 s (13.70–13.90) | 3.67 MB | 25.37 MB | 707 |',
    )
    expect(blocks['slicing-time']).toContain(
      '| WOFF2 quality 11, shipped build + profile-guided optimization, training run 2 | 15.70 s (15.60–15.80) | 3.67 MB | 25.37 MB | 707 |',
    )
    expect(blocks['slicing-time']).toContain('og: shipped 7.50 s, quality 10 3.82 s.')
    expect(blocks['slicing-time']).toContain('Subsetting itself is 2% of the shipped slicing time')
    expect(blocks['fixture-baseline']).toContain(
      '| blog | 707 · 1,778,066 B / 2,320,172 B · 61.3 · 3,162,385 B · 494,727 B |',
    )
  })

  it('marks the stages that were not measured', () => {
    const results = syntheticResults()
    results.loadingTime = null
    results.slicingTime = null
    results.stages['loading-time'] = null
    results.stages['slicing-time'] = null
    const blocks = renderBlocks(results)
    expect(blocks['loading-time']).toBe('*Not measured in this run.*')
    expect(blocks['loading-model']).toBe('*Not measured in this run.*')
    expect(blocks.costs).toBe('*Not measured in this run.*')
    expect(blocks['slicing-time']).toBe('*Not measured in this run.*')
    expect(blocks.decision).toContain('the loading-time stage was not measured in this run')
    expect(blocks.header).toContain('Not measured: loading-time, slicing-time.')
    expect(blocks.header).not.toContain('Carried over')
    expect(escapeCell('a|b')).toBe('a\\|b')
  })

  it('names the carried stages against the start of the run, whichever stage was skipped', () => {
    const results = syntheticResults()
    results.stages['page-cost'] = '2026-11-26T09:00:00.000Z'
    results.stages['slicing-time'] = results.startedAt
    const header = renderBlocks(results).header
    expect(header).toContain('Carried over from earlier runs: page-cost (2026-11-26).')
    expect(header).not.toContain('slicing-time')
    results.stages = { ...results.stages, 'page-cost': results.startedAt, 'slicing-time': results.startedAt }
    expect(renderBlocks(results).header).not.toContain('Carried over')
  })

  it('refuses a block that carries a value it cannot state', () => {
    const results = syntheticResults()
    results.fonts[0]!.bytes = Number.NaN
    expect(() => renderBlocks(results)).toThrow(/block carries NaN/)
  })

  it('states a single training run without numbering it', () => {
    const results = syntheticResults()
    const variants = results.slicingTime!.fonts.calendar!.variants
    results.slicingTime!.fonts.calendar!.variants = variants.filter((entry) => entry.build !== 2)
    const blocks = renderBlocks(results)
    expect(blocks.costs).toContain(
      '**Profile-guided optimization**: 1 independent training run and build measures 13.80 s (−8%; 13.70–13.90 s) ' +
        'against the shipped 15.06 s (14.96–15.16 s over the interleaved runs), trained on the benchmark fonts; Homebrew ' +
        'LLVM version 23.1.6.',
    )
    expect(blocks.costs).not.toContain('spans')
    expect(blocks['slicing-time']).toContain(
      '| WOFF2 quality 11, shipped build + profile-guided optimization | 13.80 s (13.70–13.90) | 3.67 MB | 25.37 MB | 707 |',
    )
  })

  it('flags a quick run and quotes only what it sampled', () => {
    const results = syntheticResults()
    results.quick = true
    results.loadingTime!.pairsPerLink = { slow: 1, fast: 2 }
    const blocks = renderBlocks(results)
    expect(blocks.header).toContain('A `--quick` run: its timing samples are too few for conclusions.')
    expect(blocks.parameters).toContain(
      '1 page pair per point on the slow link and 2 page pairs on the fast link; 2 interleaved slicing runs per variant (2 for the second font)',
    )
    expect(blocks['loading-model']).toBe('*A `--quick` run: too few samples to fit the cost model.*')
    expect(blocks.decision).toContain(
      'a cold page takes 39 KB (+2.3%) more bytes for 3.6 fewer requests (64.9 vs 61.3); the loading-time ranges need a ' +
        'full run, this one is `--quick`.',
    )
    expect(syntheticResults().quick).toBe(false)
    expect(percent(-0.2)).toBe('0%')
    expect(percent(-12.4)).toBe('−12%')
    expect(percent(4.6)).toBe('5%')
  })
})
