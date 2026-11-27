import { renderCharts } from '@kobato/font-split/scripts/bench/suite/charts'
import { syntheticResults } from '@kobato/font-split/tests/unit/scripts/bench/results-fixture'
import { describe, expect, it } from 'vitest'

const ALL_CHARTS = [
  'deployed-vs-retune.svg',
  'lambda-cold-page.svg',
  'lambda-next-page.svg',
  'lambda-trade-off.svg',
  'by-page-size.svg',
  'loading-time.svg',
  'slicing-time.svg',
]

describe('font-split benchmark charts', () => {
  it('draws one well-formed SVG per chart', () => {
    const charts = renderCharts(syntheticResults())
    expect([...charts.keys()]).toEqual(ALL_CHARTS)
    for (const [name, svg] of charts) {
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '), name).toBe(true)
      expect(svg.endsWith('</svg>\n'), name).toBe(true)
      expect(svg).not.toMatch(/NaN|undefined|Infinity/)
      expect(svg.match(/<g /g)?.length, name).toBe(svg.match(/<\/g>/g)?.length)
      expect(svg.match(/<text/g)?.length, name).toBeGreaterThan(3)
    }
  })

  it('compares the deployed package with the shipped algorithm', () => {
    const svg = renderCharts(syntheticResults()).get('deployed-vs-retune.svg')!
    expect(svg).toContain('cn-font-split (deployed package)')
    expect(svg).toContain('shipped algorithm (λ=55 KB)')
    expect(svg).toContain('>1,736<')
    expect(svg).toContain('>2,570<')
    expect(svg.match(/<rect /g)).toHaveLength(14)
  })

  it('keeps the λ frontier on its axes and marks the shipped λ', () => {
    const charts = renderCharts(syntheticResults())
    for (const name of ['lambda-cold-page.svg', 'lambda-next-page.svg']) {
      const svg = charts.get(name)!
      expect(svg).toContain('λ=55')
      expect(svg).toContain('wiki hant')
      expect(svg).toContain('cn-font-split')
    }
    const tradeOff = charts.get('lambda-trade-off.svg')!
    for (const lambda of [20, 25, 30, 37.5, 45, 55, 60, 80, 120]) {
      expect(tradeOff).toContain(`>${lambda}</text>`)
    }
    expect(charts.get('by-page-size.svg')).toContain('λ=30 KB')
  })

  it('draws a series per link and protocol and a bar per slicing variant', () => {
    const charts = renderCharts(syntheticResults())
    const loading = charts.get('loading-time.svg')!
    for (const name of ['H1 slow', 'H1 fast', 'H2 slow', 'H2 fast']) {
      expect(loading).toContain(`>${name}</text>`)
    }
    const slicing = charts.get('slicing-time.svg')!
    expect(slicing.match(/<rect /g)).toHaveLength(8)
    expect(slicing).toContain('>15.06<')
    expect(slicing).toContain('PGO')
    expect(slicing).toContain('>run 1</text>')
    expect(slicing).toContain('>run 2</text>')
  })

  it('refuses a chart that carries a value it cannot state', () => {
    const results = syntheticResults()
    results.pageCost.deployed.corpora.blog.coldMeanBytes = Number.NaN
    expect(() => renderCharts(results)).toThrow(/chart carries NaN/)
  })

  it('skips the charts of stages that were not measured', () => {
    const results = syntheticResults()
    results.loadingTime = null
    results.slicingTime = null
    const charts = renderCharts(results)
    expect([...charts.keys()]).toEqual(ALL_CHARTS.slice(0, 5))
  })
})
