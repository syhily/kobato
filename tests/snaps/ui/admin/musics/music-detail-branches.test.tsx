import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto } from '@/shared/contracts/music'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'

// `MusicDetailView` is already covered by `musics-branches.test.tsx` for the
// loading / error / not-found / resolved / no-cover / empty-lyrics branches.
// This suite adds the remaining SSR-reachable render path driven by the
// music-player context: the play/pause button reflects whether the current
// track is the one being viewed and whether playback is active.

const playerState = vi.hoisted(() => ({
  currentTrack: null as AdminMusicDto | null,
  isPlaying: false,
  currentTime: 0,
}))

vi.mock('@/ui/admin/musics/MusicPlayerContext', () => ({
  useMusicPlayerActions: () => ({
    load: vi.fn(),
    toggle: vi.fn(),
  }),
  useMusicPlayerState: () => ({
    currentTrack: playerState.currentTrack,
    isPlaying: playerState.isPlaying,
  }),
  useMusicPlayerTime: () => playerState.currentTime,
}))

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as { music: AdminMusicDto } | null,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutation: { mutate: vi.fn(), isPending: false },
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      music: {
        get: {
          queryOptions: (args: unknown) => ({
            queryKey: ['music', 'get', args],
            queryFn: async () => ({}),
          }),
          key: (args: unknown) => ['music', 'get', args],
        },
      },
    },
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function makeAdminMusic(overrides: Partial<AdminMusicDto> = {}): AdminMusicDto {
  return {
    id: 'music-1',
    source: 'netease',
    sourceId: '1001',
    playerId: 'abcdef0123456789',
    name: '青花瓷',
    artist: ['周杰伦'],
    album: '我很忙',
    audioStoragePath: 'music/audio.mp3',
    audioUrl: 'https://cdn.example.com/audio.mp3',
    coverStoragePath: 'music/cover.jpg',
    coverUrl: 'https://cdn.example.com/cover.jpg',
    lyric: '[00:01.00]素胚勾勒出青花笔锋浓转淡',
    uploaderId: 'user-1',
    uploaderName: '雨帆',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

const navigateMock = vi.fn()

function renderDetail(): string {
  return stableHtml(
    renderInRouter(<MusicDetailView id="music-1" navigate={navigateMock} />, '/admin/library/music/music-1'),
  )
}

describe('snapshot: MusicDetailView player-context branches', () => {
  beforeEach(() => {
    playerState.currentTrack = null
    playerState.isPlaying = false
    playerState.currentTime = 0
    queryMocks.query = {
      data: null,
      isLoading: true,
      isPending: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the play button when the track is not the current track', () => {
    const music = makeAdminMusic({ id: 'music-1' })
    playerState.currentTrack = makeAdminMusic({
      id: 'music-other',
      name: '其他歌曲',
    })
    playerState.isPlaying = true
    queryMocks.query = {
      data: { music },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }

    const html = renderDetail()
    expect(html).toContain('青花瓷')
    expect(html).toContain('aria-label="播放"')
    expect(html).toContain('lucide-play')
    expect(html).not.toContain('aria-label="暂停"')
  })

  it('renders the pause button when the track is the current track and playing', () => {
    const music = makeAdminMusic({ id: 'music-1' })
    playerState.currentTrack = music
    playerState.isPlaying = true
    queryMocks.query = {
      data: { music },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }

    const html = renderDetail()
    expect(html).toContain('青花瓷')
    expect(html).toContain('aria-label="暂停"')
    expect(html).toContain('lucide-pause')
    expect(html).not.toContain('aria-label="播放"')
  })
})
