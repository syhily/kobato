import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto } from '@/shared/contracts/music'

import { renderHook } from '#/_helpers/hook'
import {
  MusicPlayerProvider,
  useMusicPlayerActions,
  useMusicPlayerState,
  useMusicPlayerTime,
} from '@/ui/admin/musics/MusicPlayerContext'

// The SSR `renderHook` harness runs a single pass with no effects, so the
// audio-setup effect never fires and `audioRef.current` stays null.

const track: AdminMusicDto = {
  id: 'm1',
  source: 'netease',
  sourceId: '1',
  playerId: 'player0000000001',
  name: 'Song',
  artist: ['Artist'],
  album: 'Album',
  audioStoragePath: '/a.mp3',
  audioUrl: 'https://example.com/a.mp3',
  coverStoragePath: '/c.png',
  coverUrl: 'https://example.com/c.png',
  lyric: null,
  uploaderId: null,
  uploaderName: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('ui/admin/musics/MusicPlayerContext — fallbacks (no provider)', () => {
  it('useMusicPlayerState returns DEFAULT_STATE when consumed outside a provider', () => {
    const state = renderHook(() => useMusicPlayerState())
    expect(state).toEqual({
      currentTrack: null,
      isPlaying: false,
      duration: 0,
      volume: 0.7,
      muted: false,
      extractedColor: null,
      playlist: [],
      currentIndex: -1,
    })
  })

  it('useMusicPlayerTime returns 0 when consumed outside a provider', () => {
    const time = renderHook(() => useMusicPlayerTime())
    expect(time).toBe(0)
  })

  it('useMusicPlayerActions returns NOOP_ACTIONS outside a provider', () => {
    const actions = renderHook(() => useMusicPlayerActions())
    for (const fn of Object.values(actions)) {
      expect(typeof fn).toBe('function')
    }
    expect(actions.load(track)).toBeUndefined()
    expect(actions.playIndex(0)).toBeUndefined()
    expect(actions.toggle()).toBeUndefined()
    expect(actions.pause()).toBeUndefined()
    expect(actions.seek(1)).toBeUndefined()
    expect(actions.setVolume(0.5)).toBeUndefined()
    expect(actions.toggleMute()).toBeUndefined()
    expect(actions.close()).toBeUndefined()
  })
})

describe('ui/admin/musics/MusicPlayerContext — provider initial state', () => {
  it('exposes the default initial state on first render', () => {
    const state = renderHook(() => useMusicPlayerState(), {
      wrapper: MusicPlayerProvider,
    })
    expect(state.currentTrack).toBeNull()
    expect(state.isPlaying).toBe(false)
    expect(state.duration).toBe(0)
    expect(state.volume).toBe(0.7)
    expect(state.muted).toBe(false)
    expect(state.extractedColor).toBeNull()
    expect(state.playlist).toEqual([])
    expect(state.currentIndex).toBe(-1)
  })

  it('exposes currentTime 0 on first render via the time hook', () => {
    const time = renderHook(() => useMusicPlayerTime(), {
      wrapper: MusicPlayerProvider,
    })
    expect(time).toBe(0)
  })

  it('returns the full set of action callbacks from the provider', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(Object.keys(actions).sort()).toEqual(
      ['close', 'load', 'pause', 'playIndex', 'seek', 'setVolume', 'toggle', 'toggleMute'].sort(),
    )
    for (const fn of Object.values(actions)) {
      expect(typeof fn).toBe('function')
    }
  })
})

describe('ui/admin/musics/MusicPlayerContext — action no-ops (no audio in SSR)', () => {
  it('load is a no-op when the audio element is not mounted', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
      actions: [
        (a) => expect(() => a.load(track)).not.toThrow(),
        (a) => expect(() => a.load(track, [track])).not.toThrow(),
      ],
    })
    expect(() => actions.load(track, [track])).not.toThrow()
  })

  it('load with an empty playlist argument is a no-op', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.load(track, [])).not.toThrow()
  })

  it('toggle is a no-op when the audio element is not mounted', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.toggle()).not.toThrow()
  })

  it('pause is a no-op when the audio element is not mounted', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.pause()).not.toThrow()
  })

  it('seek is a no-op when the audio element is not mounted', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.seek(42)).not.toThrow()
  })

  it('setVolume is a no-op when the audio element is not mounted', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.setVolume(0.3)).not.toThrow()
  })

  it('toggleMute is a no-op when the audio element is not mounted', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.toggleMute()).not.toThrow()
  })

  it('close resets state even without a mounted audio element', () => {
    // `close` mutates state unconditionally, with no `audioRef.current` guard.
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.close()).not.toThrow()
  })

  it('playIndex guards against out-of-range indices', () => {
    const actions = renderHook(() => useMusicPlayerActions(), {
      wrapper: MusicPlayerProvider,
    })
    expect(() => actions.playIndex(-1)).not.toThrow()
    expect(() => actions.playIndex(0)).not.toThrow()
    expect(() => actions.playIndex(99)).not.toThrow()
  })
})

describe('ui/admin/musics/MusicPlayerContext — HTMLAudioElement polyfill safety', () => {
  // The module must load cleanly under node without audio/Image globals.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not throw when constructing the provider tree', () => {
    expect(() => renderHook(() => useMusicPlayerState(), { wrapper: MusicPlayerProvider })).not.toThrow()
  })
})
