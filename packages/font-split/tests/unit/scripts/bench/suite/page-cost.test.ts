import { deployedBaselineJson, parseDeployedBaseline } from '@kobato/font-split/scripts/bench/suite/page-cost'
import { syntheticResults } from '@kobato/font-split/tests/unit/scripts/bench/results-fixture'
import { describe, expect, it } from 'vitest'

describe('the deployed-package baseline', () => {
  it('reads back in the shape a fresh measurement records', () => {
    const measured = syntheticResults().pageCost.deployed
    const json = deployedBaselineJson(measured)
    expect(Object.keys(JSON.parse(json))).toEqual([
      'schemaVersion',
      'measured',
      'source',
      'font',
      'chunks',
      'chunkBytes',
      'cssBytes',
      'corpora',
    ])
    expect(parseDeployedBaseline(json)).toStrictEqual(measured)
  })

  it('rejects a malformed file', () => {
    expect(() => parseDeployedBaseline('{"schemaVersion": 2}')).toThrow(/malformed/)
    expect(() => parseDeployedBaseline('{"schemaVersion": 1, "measured": "2026-11-27"}')).toThrow(/malformed/)
    expect(() => parseDeployedBaseline('not json')).toThrow()
  })
})
