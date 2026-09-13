import { useCallback, useEffect, useRef, useState } from 'react'

export type UseMusicPlaybackOptions = {
  src: string
  initialVolume?: number
  onError?: () => void
}

let cachedVolumeSupport: boolean | null = null

/**
 * iOS Safari ignores programmatic `audio.volume` — the level is read-only
 * and owned by the hardware keys, so a software volume slider can never
 * take effect there. Probe once by writing and reading back. SSR defaults
 * to true so static markup keeps the control.
 */
export function isProgrammaticVolumeSupported(): boolean {
  if (typeof document === 'undefined') {
    return true
  }
  if (cachedVolumeSupport === null) {
    const probe = document.createElement('audio')
    probe.volume = 0.5
    cachedVolumeSupport = probe.volume === 0.5
  }
  return cachedVolumeSupport
}

/** Test seam: clears the memoized probe (same pattern as `__resetRateLimitsForTests`). */
export function __resetProgrammaticVolumeSupportForTests(): void {
  cachedVolumeSupport = null
}

/**
 * Playback core for the music-player card: owns a detached HTMLAudioElement
 * and exposes state + actions. `currentTime` is polled with
 * requestAnimationFrame while playing (the `timeupdate` event fires at ~4Hz,
 * too coarse for a smooth progress bar and line-synced lyrics).
 */
export function useMusicPlayback({ src, initialVolume = 0.7, onError }: UseMusicPlaybackOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(initialVolume)
  const [muted, setMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isVolumeSupported] = useState(isProgrammaticVolumeSupported)

  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  useEffect(() => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = src
    audio.volume = initialVolume
    audioRef.current = audio

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => {
      setIsPlaying(false)
      setCurrentTime(audio.currentTime)
    }
    const handleDurationChange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const handleVolumeChange = () => {
      setVolumeState(audio.volume)
      setMuted(audio.muted)
    }
    const handleWaiting = () => setIsLoading(true)
    const handlePlaying = () => setIsLoading(false)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    const handleError = () => {
      setHasError(true)
      setIsLoading(false)
      onErrorRef.current?.()
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('volumechange', handleVolumeChange)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.pause()
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('volumechange', handleVolumeChange)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audioRef.current = null
    }
  }, [src, initialVolume])

  useEffect(() => {
    if (!isPlaying) {
      return
    }
    let frame = 0
    const tick = () => {
      const audio = audioRef.current
      if (audio) {
        setCurrentTime(audio.currentTime)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    if (audio.paused) {
      void audio.play().catch(() => {
        // Ignore autoplay policy rejections
      })
    } else {
      audio.pause()
    }
  }, [])

  const seek = useCallback((second: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = second
      setCurrentTime(second)
    }
  }, [])

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.volume = value
      audio.muted = value === 0
    }
  }, [])

  const toggleMuted = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.muted = !audio.muted
    }
  }, [])

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    isLoading,
    hasError,
    isVolumeSupported,
    togglePlay,
    seek,
    setVolume,
    toggleMuted,
  }
}

export type MusicPlayback = ReturnType<typeof useMusicPlayback>
