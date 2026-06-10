import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AdminMusicDto } from '@/shared/types/music'

import { useDominantColor } from '@/ui/admin/musics/useDominantColor'

interface MusicPlayerState {
  currentTrack: AdminMusicDto | null
  isPlaying: boolean
  duration: number
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

interface MusicPlayerTimeValue {
  currentTime: number
}

const MusicPlayerActionsContext = createContext<MusicPlayerActions | null>(null)
const MusicPlayerStateContext = createContext<MusicPlayerState | null>(null)
const MusicPlayerTimeContext = createContext<MusicPlayerTimeValue | null>(null)

const NOOP_ACTIONS: MusicPlayerActions = {
  load: () => undefined,
  playIndex: () => undefined,
  toggle: () => undefined,
  pause: () => undefined,
  seek: () => undefined,
  setVolume: () => undefined,
  toggleMute: () => undefined,
  close: () => undefined,
}

const DEFAULT_STATE: MusicPlayerState = {
  currentTrack: null,
  isPlaying: false,
  duration: 0,
  volume: 0.7,
  muted: false,
  extractedColor: null,
  playlist: [],
  currentIndex: -1,
}

export function useMusicPlayerActions(): MusicPlayerActions {
  const ctx = use(MusicPlayerActionsContext)
  return ctx ?? NOOP_ACTIONS
}

export function useMusicPlayerState(): MusicPlayerState {
  const ctx = use(MusicPlayerStateContext)
  return ctx ?? DEFAULT_STATE
}

export function useMusicPlayerTime(): number {
  const ctx = use(MusicPlayerTimeContext)
  return ctx?.currentTime ?? 0
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
  const timeLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canPlayListenerRef = useRef<(() => void) | null>(null)
  const playlistRef = useRef<AdminMusicDto[]>([])
  const lastLoadIdRef = useRef(0)
  const getDominantColor = useDominantColor()

  useEffect(() => {
    playlistRef.current = playlist
  }, [playlist])

  const currentIndexRef = useRef(currentIndex)
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  const stopTimeLoop = useCallback(() => {
    if (timeLoopRef.current) {
      clearInterval(timeLoopRef.current)
      timeLoopRef.current = null
    }
  }, [])

  const startTimeLoop = useCallback(() => {
    stopTimeLoop()
    timeLoopRef.current = setInterval(() => {
      const audio = audioRef.current
      if (audio) {
        setCurrentTime(audio.currentTime)
      }
    }, 100)
  }, [stopTimeLoop])

  const load = useCallback(
    (track: AdminMusicDto, newPlaylist?: AdminMusicDto[]) => {
      const audio = audioRef.current
      if (!audio) {
        return
      }

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

      const loadId = ++lastLoadIdRef.current
      void getDominantColor(track.coverUrl).then((color) => {
        if (loadId === lastLoadIdRef.current) {
          setExtractedColor(color ?? 'var(--brand)')
        }
      })

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
      const pl = playlistRef.current
      if (index < 0 || index >= pl.length) {
        return
      }
      const track = pl[index]
      if (track) {
        load(track, pl)
      }
    },
    [load],
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
      stopTimeLoop()
      const next = currentIndexRef.current + 1
      if (next < playlistRef.current.length) {
        playIndex(next)
      } else {
        setIsPlaying(false)
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
  }, [startTimeLoop, stopTimeLoop, playIndex])

  const actions = useMemo<MusicPlayerActions>(
    () => ({
      load,
      playIndex,
      toggle,
      pause,
      seek,
      setVolume,
      toggleMute,
      close,
    }),
    [load, playIndex, toggle, pause, seek, setVolume, toggleMute, close],
  )

  const state = useMemo<MusicPlayerState>(
    () => ({
      currentTrack,
      isPlaying,
      duration,
      volume,
      muted,
      extractedColor,
      playlist,
      currentIndex,
    }),
    [currentTrack, isPlaying, duration, volume, muted, extractedColor, playlist, currentIndex],
  )

  const timeValue = useMemo<MusicPlayerTimeValue>(() => ({ currentTime }), [currentTime])

  return (
    <MusicPlayerActionsContext value={actions}>
      <MusicPlayerStateContext value={state}>
        <MusicPlayerTimeContext value={timeValue}>{children}</MusicPlayerTimeContext>
      </MusicPlayerStateContext>
    </MusicPlayerActionsContext>
  )
}
