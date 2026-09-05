import { describe, expect, it } from 'vitest'

import { CORE_PLUGINS } from '@/plugins/CorePlugins'
import { DEFAULT_FEATURE_PLUGINS } from '@/plugins/DefaultFeaturePlugins'

// Guards for the default plugin sets — the plugin analogue of
// test/unit/nodes/derived-node-sets.test.ts.
describe('default feature plugin set', () => {
  it('assigns every entry a unique render key', () => {
    const keys = DEFAULT_FEATURE_PLUGINS.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('core plugin set', () => {
  it('assigns every entry a unique render key', () => {
    const keys = CORE_PLUGINS.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('shares no keys with the feature plugin set', () => {
    const featureKeys = new Set(DEFAULT_FEATURE_PLUGINS.map((entry) => entry.key))
    expect(CORE_PLUGINS.filter((entry) => featureKeys.has(entry.key))).toEqual([])
  })

  // The default editor surface is CORE_PLUGINS + DEFAULT_FEATURE_PLUGINS —
  // this snapshot pins the full key list so silently dropping a plugin from
  // either set fails CI instead of slipping through (the uniqueness checks
  // above guard shape, not membership).
  it('pins the default surface plugin keys', () => {
    expect({
      core: CORE_PLUGINS.map((entry) => entry.key),
      features: DEFAULT_FEATURE_PLUGINS.map((entry) => entry.key),
    }).toMatchSnapshot()
  })
})
