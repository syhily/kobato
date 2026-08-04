import { renderHook } from '#/_helpers/hook'

import { useAudioControl } from '@kobato/ui/public/aplayer/hooks/use-audio-control'
import { describe, expect, it, vi } from 'vitest'

// useAudioControl creates an HTMLAudioElement inside a useEffect and binds
// its event listeners there. The SSR renderHook harness renders a single
// synchronous pass, so that effect never runs and `audioRef.current`
// stays null. What IS observable in one pass:
//   - the initial state values (isPlaying, currentTime, duration, etc.)
//   - the callbacks are returned as functions
//   - every callback short-circuits when there is no audio element
//     (the `if (!audio) return` guards), so calling them is a safe no-op
//
// The event-listener wiring and the real play/pause/seek paths require a
// live HTMLAudioElement, which is exercised in the aplayer controller /
// player snapshot tests instead.

describe('ui/public/aplayer/hooks/useAudioControl — initial state', () => {
  it('returns the documented defaults when no options override them', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    expect(api.isPlaying).toBe(false)
    expect(api.currentTime).toBe(0)
    expect(api.duration).toBe(0)
    expect(api.bufferedSeconds).toBe(0)
    expect(api.volume).toBe(0.7) // default initialVolume
    expect(api.muted).toBe(false)
    expect(api.isLoading).toBe(false)
    expect(api.loop).toBe(false)
  })

  it('honours an explicit initialVolume', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3', initialVolume: 0.25 }))
    expect(api.volume).toBe(0.25)
  })

  it('honours initialVolume of 0', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3', initialVolume: 0 }))
    expect(api.volume).toBe(0)
  })

  it('falls back to 0.7 when initialVolume is undefined and the nullish coalesce engages', () => {
    // initialVolume ?? 0.7 — passing `undefined` exercises the ?? branch.
    const api = renderHook(() => useAudioControl({ src: '/x', initialVolume: undefined }))
    expect(api.volume).toBe(0.7)
  })

  it('returns all control callbacks as functions', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    expect(api.playAudio).toBeInstanceOf(Function)
    expect(api.togglePlay).toBeInstanceOf(Function)
    expect(api.seek).toBeInstanceOf(Function)
    expect(api.toggleMuted).toBeInstanceOf(Function)
    expect(api.setVolume).toBeInstanceOf(Function)
    expect(api.toggleLoop).toBeInstanceOf(Function)
  })
})

describe('ui/public/aplayer/hooks/useAudioControl — no-op callbacks (no audio element in SSR)', () => {
  it('playAudio resolves without throwing when no audio is mounted', async () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    await expect(api.playAudio()).resolves.toBeUndefined()
  })

  it('togglePlay is a no-op when no audio is mounted', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    expect(() => api.togglePlay()).not.toThrow()
  })

  it('seek is a no-op when no audio is mounted', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    expect(() => api.seek(42)).not.toThrow()
  })

  it('toggleMuted is a no-op when no audio is mounted', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    expect(() => api.toggleMuted()).not.toThrow()
  })

  it('setVolume is a no-op when no audio is mounted', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    expect(() => api.setVolume(0.5)).not.toThrow()
  })

  it('toggleLoop is a no-op when no audio is mounted', () => {
    const api = renderHook(() => useAudioControl({ src: '/track.mp3' }))
    expect(() => api.toggleLoop()).not.toThrow()
  })
})

describe('ui/public/aplayer/hooks/useAudioControl — option pass-through', () => {
  it('accepts onEnded / onError callbacks without invoking them during render', () => {
    const onEnded = vi.fn()
    const onError = vi.fn()
    // The hook stores these in refs and only fires them from event
    // listeners attached in the effect (which doesn't run in SSR), so
    // neither should be called during the initial render.
    const api = renderHook(() => useAudioControl({ src: '/track.mp3', onEnded, onError }))
    expect(onEnded).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    // Sanity: the rest of the API is still intact.
    expect(api.isPlaying).toBe(false)
  })
})
