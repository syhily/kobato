import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import useTypeaheadTriggerMatch from '@/hooks/useTypeaheadTriggerMatch'

describe('useTypeaheadTriggerMatch', () => {
  function getMatcher(trigger = ':', options?: { minLength?: number; maxLength?: number }) {
    const { result } = renderHook(() => useTypeaheadTriggerMatch(trigger, options))
    return result.current
  }

  it('matches a trigger at the start of the text', () => {
    const match = getMatcher()(':smi')
    expect(match).toEqual({ leadOffset: 0, matchingString: 'smi', replaceableString: ':smi' })
  })

  it('matches a trigger preceded by a space and reports the trigger offset', () => {
    const match = getMatcher()('hello :smi')
    expect(match).toEqual({ leadOffset: 6, matchingString: 'smi', replaceableString: ':smi' })
  })

  it('matches a trigger inside a word (no leading boundary is required)', () => {
    // unlike lexical's stock matcher this hook intentionally does not require
    // punctuation/space before the trigger, so `foo:bar` matches at the `:`
    const match = getMatcher()('foo:bar')
    expect(match).toEqual({ leadOffset: 3, matchingString: 'bar', replaceableString: ':bar' })
  })

  it('returns null when the trigger is absent', () => {
    expect(getMatcher()('plain text')).toBeNull()
    expect(getMatcher()('')).toBeNull()
  })

  it('returns null when whitespace terminates the query', () => {
    expect(getMatcher()(':smile ')).toBeNull()
    expect(getMatcher()('foo:smile face')).toBeNull()
  })

  it('returns null when the query is shorter than minLength', () => {
    const matchShort = getMatcher(':', { minLength: 2 })
    expect(matchShort(':a')).toBeNull()
    expect(matchShort(':ab')).toEqual({ leadOffset: 0, matchingString: 'ab', replaceableString: ':ab' })
  })

  it('returns null for a bare trigger (empty query below minLength)', () => {
    expect(getMatcher()(':')).toBeNull()
  })

  it('returns null when the query exceeds maxLength', () => {
    const matchLimited = getMatcher(':', { maxLength: 5 })
    expect(matchLimited(':abcde')).not.toBeNull()
    expect(matchLimited(':abcdef')).toBeNull()
  })

  it('allows punctuation within the query', () => {
    const match = getMatcher()(':smile-face!')
    expect(match).toEqual({ leadOffset: 0, matchingString: 'smile-face!', replaceableString: ':smile-face!' })
  })

  it('restarts the match at a later trigger occurrence', () => {
    // the trigger char cannot appear in the query, so the last `:` wins
    const match = getMatcher()(':sm:ok')
    expect(match).toEqual({ leadOffset: 3, matchingString: 'ok', replaceableString: ':ok' })
  })

  it('matches other trigger characters such as /', () => {
    const match = getMatcher('/')('hello /ca')
    expect(match).toEqual({ leadOffset: 6, matchingString: 'ca', replaceableString: '/ca' })
  })
})
