import { describe, expect, it } from 'vitest'

import {
  buildState,
  isOwnedTraceResource,
  isTraceContainerName,
  removeOwnedTraceResources,
  isTraceVolumeName,
  parseTraceState,
} from '../../../../scripts/trace/lib.ts'

describe('OpenObserve trace state guard and ownership grammar', () => {
  it('accepts a valid generated state and rejects extra/corrupt fields', () => {
    const state = buildState()
    expect(parseTraceState(state)).toEqual(state)
    expect(parseTraceState({ ...state, version: 2 })).toBeNull()
    expect(parseTraceState({ ...state, endpoint: 'not a url' })).toBeNull()
    expect(parseTraceState({ ...state, unexpected: 'secret' })).toBeNull()
    expect(parseTraceState({ ...state, adminEmail: '' })).toBeNull()
  })

  it('rejects path traversal and arbitrary container/volume names', () => {
    const state = buildState()
    expect(parseTraceState({ ...state, containerName: '../kobato-openobserve-dev' })).toBeNull()
    expect(parseTraceState({ ...state, containerName: 'kobato-openobserve-dev-extra' })).toBeNull()
    expect(parseTraceState({ ...state, volumeName: '/tmp/kobato-openobserve-dev-data' })).toBeNull()
    expect(parseTraceState({ ...state, volumeName: 'kobato-openobserve-dev-data-extra' })).toBeNull()
  })

  it('accepts only the closed dev/smoke ownership namespace', () => {
    expect(isTraceContainerName('kobato-openobserve-dev')).toBe(true)
    expect(isTraceContainerName('kobato-trace-smoke-0123abcd')).toBe(true)
    expect(isTraceContainerName('kobato-trace-smoke-0123ABCD')).toBe(false)
    expect(isTraceContainerName('kobato-openobserve-dev-2')).toBe(false)
    expect(isTraceVolumeName('kobato-openobserve-dev-data')).toBe(true)
    expect(isTraceVolumeName('kobato-trace-smoke-0123abcd-data')).toBe(true)
    expect(isTraceVolumeName('kobato-trace-smoke-0123abcd')).toBe(false)
    expect(isTraceVolumeName('other-data')).toBe(false)
  })

  it('never invokes Docker removal for a missing or wrong label', () => {
    const removals: string[] = []
    const boundary = {
      containerExists: () => true,
      volumeExists: () => true,
      containerLabel: () => null,
      volumeLabel: () => 'wrong',
      removeContainer: (name: string) => removals.push(`container:${name}`),
      removeVolume: (name: string) => removals.push(`volume:${name}`),
    }
    const result = removeOwnedTraceResources('kobato-openobserve-dev', true, 'kobato-openobserve-dev-data', boundary)
    expect(result.refused).toBe(true)
    expect(result.containerRemoved).toBe(false)
    expect(result.volumeRemoved).toBe(false)
    expect(removals).toEqual([])
  })

  it('never invokes Docker removal when the container label is wrong or the volume label is missing', () => {
    const removals: string[] = []
    const boundary = {
      containerExists: () => true,
      volumeExists: () => true,
      containerLabel: () => 'wrong',
      volumeLabel: () => null,
      removeContainer: (name: string) => removals.push(`container:${name}`),
      removeVolume: (name: string) => removals.push(`volume:${name}`),
    }
    const result = removeOwnedTraceResources('kobato-openobserve-dev', true, 'kobato-openobserve-dev-data', boundary)
    expect(result.refused).toBe(true)
    expect(result.containerRemoved).toBe(false)
    expect(result.volumeRemoved).toBe(false)
    expect(removals).toEqual([])
  })

  it('removes only correctly labelled owned resources', () => {
    const removals: string[] = []
    const boundary = {
      containerExists: () => true,
      volumeExists: () => true,
      containerLabel: () => 'development',
      volumeLabel: () => 'development',
      removeContainer: (name: string) => removals.push(`container:${name}`),
      removeVolume: (name: string) => removals.push(`volume:${name}`),
    }
    const result = removeOwnedTraceResources('kobato-openobserve-dev', true, 'kobato-openobserve-dev-data', boundary)
    expect(result).toEqual({ containerRemoved: true, volumeRemoved: true, refused: false })
    expect(removals).toEqual(['container:kobato-openobserve-dev', 'volume:kobato-openobserve-dev-data'])
  })

  it('does not remove an unrelated resource even when it exists', () => {
    const removals: string[] = []
    const boundary = {
      containerExists: () => true,
      volumeExists: () => true,
      containerLabel: () => 'development',
      volumeLabel: () => 'development',
      removeContainer: (name: string) => removals.push(name),
      removeVolume: (name: string) => removals.push(name),
    }
    const result = removeOwnedTraceResources('postgres', true, 'unrelated-data', boundary)
    expect(result.refused).toBe(true)
    expect(removals).toEqual([])
  })

  it('only authorizes labelled resources in the closed namespace', () => {
    expect(isOwnedTraceResource('container', 'kobato-openobserve-dev', 'development')).toBe(true)
    expect(isOwnedTraceResource('container', 'kobato-openobserve-dev', null)).toBe(false)
    expect(isOwnedTraceResource('container', 'unrelated', 'development')).toBe(false)
    expect(isOwnedTraceResource('volume', 'kobato-openobserve-dev-data', 'development')).toBe(true)
    expect(isOwnedTraceResource('volume', 'kobato-openobserve-dev-data', 'other')).toBe(false)
    expect(isOwnedTraceResource('volume', '../kobato-openobserve-dev-data', 'development')).toBe(false)
  })
})
