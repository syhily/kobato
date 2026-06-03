import { useCallback, useEffect, useRef, useState } from 'react'

export type UseAudioControlOptions = {
  src: string
  autoPlay?: boolean
  initialVolume?: number
  onEnded?: () => void
  onError?: (e: Event) => void
}

export function useAudioControl(options: UseAudioControlOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedSeconds, setBufferedSeconds] = useState(0)
  const [volume, setVolumeState] = useState(options.initialVolume ?? 0.7)
  const [muted, setMutedState] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loop, setLoop] = useState(false)

  const onEndedRef = useRef(options.onEnded)
  const onErrorRef = useRef(options.onError)
  onEndedRef.current = options.onEnded
  onErrorRef.current = options.onError

  useEffect(() => {
    const audio = document.createElement('audio')
    audio.src = options.src
    audio.volume = options.initialVolume ?? 0.7
    if (options.autoPlay) {
      audio.autoplay = true
    }
    audioRef.current = audio

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const handleProgress = () => {
      if (audio.buffered.length > 0) {
        setBufferedSeconds(audio.buffered.end(audio.buffered.length - 1))
      }
    }
    const handleVolumeChange = () => {
      setVolumeState(audio.volume)
      setMutedState(audio.muted)
    }
    const handleWaiting = () => setIsLoading(true)
    const handlePlaying = () => setIsLoading(false)
    const handleEnded = () => {
      setIsPlaying(false)
      onEndedRef.current?.()
    }
    const handleError = (e: Event) => {
      onErrorRef.current?.(e)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('progress', handleProgress)
    audio.addEventListener('volumechange', handleVolumeChange)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    if (options.autoPlay) {
      void audio.play().catch(() => {
        // Ignore autoplay policy rejections
      })
    }

    return () => {
      audio.pause()
      audio.currentTime = 0
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('progress', handleProgress)
      audio.removeEventListener('volumechange', handleVolumeChange)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audioRef.current = null
    }
  }, [options.src, options.autoPlay, options.initialVolume])

  const playAudio = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    try {
      await audio.play()
    } catch {
      // Ignore autoplay policy rejections
    }
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    if (audio.paused) {
      void playAudio()
    } else {
      audio.pause()
    }
  }, [playAudio])

  const seek = useCallback((second: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = second
    }
  }, [])

  const toggleMuted = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.muted = !audio.muted
    }
  }, [])

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.volume = value
    }
  }, [])

  const toggleLoop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.loop = !audio.loop
      setLoop(audio.loop)
    }
  }, [])

  return {
    volume,
    setVolume,
    muted,
    toggleMuted,
    isPlaying,
    duration,
    currentTime,
    bufferedSeconds,
    playAudio,
    togglePlay,
    seek,
    isLoading,
    loop,
    toggleLoop,
  }
}
