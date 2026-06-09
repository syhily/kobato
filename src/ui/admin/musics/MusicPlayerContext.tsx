import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AdminMusicDto } from '@/shared/types/music'

import { useDominantColor } from '@/ui/admin/musics/useDominantColor'

interface MusicPlayerState {
  currentTrack: AdminMusicDto | null
  isPlaying: boolean
  duration: number
  currentTime: number
  volume: number
  muted: boolean
  extractedColor: string | null
  playlist: AdminMusicDto[]
  currentIndex: number
}

interface MusicPlayerActions {
  load: (track: AdminMusicDto, playlist?: AdminMusicDto[]) => void
  playIndex: (index: number) => void
  toggle: () => void
  pause: () => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
  toggleMute: () => void
  close: () => void
}

type MusicPlayerContextValue = MusicPlayerState & MusicPlayerActions

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null)

const NOOP_CTX: MusicPlayerContextValue = {
  currentTrack: null,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  volume: 0.7,
  muted: false,
  extractedColor: null,
  playlist: [],
  currentIndex: -1,
  load: () => undefined,
  playIndex: () => undefined,
  toggle: () => undefined,
  pause: () => undefined,
  seek: () => undefined,
  setVolume: () => undefined,
  toggleMute: () => undefined,
  close: () => undefined,
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = use(MusicPlayerContext)
  return ctx ?? NOOP_CTX
}

export interface MusicPlayerProviderProps {
  children: ReactNode
}

export function MusicPlayerProvider({ children }: MusicPlayerProviderProps) {
  const [currentTrack, setCurrentTrack] = useState<AdminMusicDto | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolumeState] = useState(0.7)
  const [muted, setMutedState] = useState(false)
  const [extractedColor, setExtractedColor] = useState<string | null>(null)
  const [playlist, setPlaylist] = useState<AdminMusicDto[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)
  const canPlayListenerRef = useRef<(() => void) | null>(null)
  const playlistRef = useRef<AdminMusicDto[]>([])
  const lastLoadIdRef = useRef(0)
  const getDominantColor = useDominantColor()

  // Keep refs in sync so audio event listeners can read the latest state
  // without re-registering the listeners on every state change.
  useEffect(() => {
    playlistRef.current = playlist
  }, [playlist])

  const currentIndexRef = useRef(currentIndex)
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  const stopTimeLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  // Smooth currentTime updates via rAF
  const startTimeLoop = useCallback(() => {
    stopTimeLoop()
    const tick = () => {
      if (rafRef.current === 0) {
        return
      }
      const audio = audioRef.current
      if (audio) {
        setCurrentTime(audio.currentTime)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopTimeLoop])

  const load = useCallback(
    (track: AdminMusicDto, newPlaylist?: AdminMusicDto[]) => {
      const audio = audioRef.current
      if (!audio) {
        return
      }

      // Clean up any pending canplay listener from a previous load
      if (canPlayListenerRef.current) {
        audio.removeEventListener('canplay', canPlayListenerRef.current)
        canPlayListenerRef.current = null
      }

      stopTimeLoop()
      audio.pause()
      audio.src = track.audioUrl
      audio.load()

      setCurrentTrack(track)
      setCurrentTime(0)
      setDuration(0)
      setIsPlaying(true)

      if (newPlaylist && newPlaylist.length > 0) {
        setPlaylist(newPlaylist)
        const idx = newPlaylist.findIndex((t) => t.id === track.id)
        setCurrentIndex(idx >= 0 ? idx : 0)
      } else {
        setPlaylist([track])
        setCurrentIndex(0)
      }

      // Extract dominant color — guard against race conditions from rapid switches
      const loadId = ++lastLoadIdRef.current
      void getDominantColor(track.coverUrl).then((color) => {
        if (loadId === lastLoadIdRef.current) {
          setExtractedColor(color ?? 'var(--brand)')
        }
      })

      // Auto-play when ready
      const tryPlay = () => {
        void audio.play().catch(() => {
          setIsPlaying(false)
        })
      }

      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        tryPlay()
      } else {
        const onCanPlay = () => {
          audio.removeEventListener('canplay', onCanPlay)
          canPlayListenerRef.current = null
          tryPlay()
        }
        canPlayListenerRef.current = onCanPlay
        audio.addEventListener('canplay', onCanPlay)
      }
    },
    [getDominantColor, stopTimeLoop],
  )

  const playIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= playlist.length) {
        return
      }
      const track = playlist[index]
      if (track) {
        load(track, playlist)
      }
    },
    [playlist, load],
  )

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    if (audio.paused) {
      void audio.play().catch(() => {
        // Play interrupted or autoplay policy rejection
      })
    } else {
      audio.pause()
    }
  }, [])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
    }
  }, [])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (audio) {
      const clamped =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.max(0, Math.min(time, audio.duration))
          : Math.max(0, time)
      audio.currentTime = clamped
      setCurrentTime(clamped)
    }
  }, [])

  const setVolume = useCallback((vol: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, vol))
    }
  }, [])

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.muted = !audio.muted
    }
  }, [])

  const close = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ''
    }
    setCurrentTrack(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setExtractedColor(null)
    setPlaylist([])
    setCurrentIndex(-1)
    stopTimeLoop()
  }, [stopTimeLoop])

  // Setup audio element and event listeners — runs once on mount.
  // playlistRef is used inside listeners so we never need to re-register.
  useEffect(() => {
    const audio = new Audio()
    audio.volume = 0.7
    audioRef.current = audio

    const handlePlay = () => {
      setIsPlaying(true)
      startTimeLoop()
    }
    const handlePause = () => {
      setIsPlaying(false)
      stopTimeLoop()
    }
    const handleDurationChange = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    const handleVolumeChange = () => {
      setVolumeState(audio.volume)
      setMutedState(audio.muted)
    }
    const handleEnded = () => {
      setIsPlaying(false)
      stopTimeLoop()
      const currentPlaylist = playlistRef.current
      const next = currentIndexRef.current + 1
      if (next < currentPlaylist.length) {
        const nextTrack = currentPlaylist[next]
        if (nextTrack) {
          audio.src = nextTrack.audioUrl
          audio.load()
          setCurrentTrack(nextTrack)
          setCurrentIndex(next)
          const onCanPlay = () => {
            audio.removeEventListener('canplay', onCanPlay)
            canPlayListenerRef.current = null
            void audio.play().catch(() => {
              // Play interrupted or autoplay policy rejection
            })
          }
          canPlayListenerRef.current = onCanPlay
          audio.addEventListener('canplay', onCanPlay)
          if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            void audio.play().catch(() => {
              // Play interrupted or autoplay policy rejection
            })
          }
        }
      }
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('volumechange', handleVolumeChange)
    audio.addEventListener('ended', handleEnded)

    return () => {
      stopTimeLoop()
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('volumechange', handleVolumeChange)
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [startTimeLoop, stopTimeLoop])

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      currentTrack,
      isPlaying,
      duration,
      currentTime,
      volume,
      muted,
      extractedColor,
      playlist,
      currentIndex,
      load,
      playIndex,
      toggle,
      pause,
      seek,
      setVolume,
      toggleMute,
      close,
    }),
    [
      currentTrack,
      isPlaying,
      duration,
      currentTime,
      volume,
      muted,
      extractedColor,
      playlist,
      currentIndex,
      load,
      playIndex,
      toggle,
      pause,
      seek,
      setVolume,
      toggleMute,
      close,
    ],
  )

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
}
