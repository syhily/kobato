import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

type CreateAudioElementOptions = {
  src?: string
  autoPlay?: boolean
  initialVolume?: number
  onEnded?: () => void
  onError?: (e: Event) => void
}

function useCreateAudioElement(options?: CreateAudioElementOptions) {
  const audioElementRef = useRef<HTMLAudioElement | undefined>(undefined)

  if (typeof document !== 'undefined' && !audioElementRef.current) {
    const audio = (audioElementRef.current = document.createElement('audio'))

    if (typeof options?.src !== 'undefined') {
      audio.src = options.src
    }
    if (typeof options?.autoPlay !== 'undefined') {
      audio.autoplay = options.autoPlay
    }
    if (typeof options?.initialVolume !== 'undefined') {
      audio.volume = options.initialVolume
    }
  }

  useEffect(() => {
    const audio = audioElementRef.current
    const handler = options?.onError
    if (audio && handler) {
      audio.addEventListener('error', handler)
      return () => {
        audio.removeEventListener('error', handler)
      }
    }
  }, [options?.onError])

  useEffect(() => {
    const audio = audioElementRef.current
    const handler = options?.onEnded
    if (audio && handler) {
      audio.addEventListener('ended', handler)
      return () => {
        audio.removeEventListener('ended', handler)
      }
    }
  }, [options?.onEnded])

  useEffect(() => {
    return () => {
      const audio = audioElementRef.current
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      audioElementRef.current = undefined
    }
  }, [])

  return audioElementRef
}

export function useAudioControl(options: CreateAudioElementOptions) {
  const audioElementRef = useCreateAudioElement(options)

  const playAudio = useCallback(
    async (src: string) => {
      const audio = audioElementRef.current
      if (audio) {
        if (audio.src !== src) {
          audio.pause()
          audio.currentTime = 0
          audio.src = src
        }
        try {
          await audioElementRef.current?.play()
        } catch {
          // Ignore autoplay policy rejections
        }
      }
    },
    [audioElementRef],
  )

  const togglePlay = useCallback(
    (src: string) => {
      const audio = audioElementRef.current
      if (!audio) {
        return
      }
      if (audio.paused) {
        void playAudio(src)
      } else {
        audio.pause()
      }
    },
    [audioElementRef, playAudio],
  )

  const seek = useCallback(
    (second: number) => {
      const audio = audioElementRef.current
      if (audio) {
        audio.currentTime = second
      }
    },
    [audioElementRef],
  )

  const toggleMuted = useCallback(() => {
    const audio = audioElementRef.current
    if (audio) {
      audio.muted = !audio.muted
    }
  }, [audioElementRef])

  const setVolume = useCallback(
    (value: number) => {
      const audio = audioElementRef.current
      if (audio) {
        audio.volume = value
      }
    },
    [audioElementRef],
  )

  const volume = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        audioElementRef.current?.addEventListener('volumechange', onStoreChange)
        return () => {
          audioElementRef.current?.removeEventListener('volumechange', onStoreChange)
        }
      },
      [audioElementRef],
    ),
    () => audioElementRef.current?.volume,
    () => undefined,
  )

  const muted = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        audioElementRef.current?.addEventListener('volumechange', onStoreChange)
        return () => {
          audioElementRef.current?.removeEventListener('volumechange', onStoreChange)
        }
      },
      [audioElementRef],
    ),
    () => audioElementRef.current?.muted,
    () => undefined,
  )

  const currentTime = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        audioElementRef.current?.addEventListener('timeupdate', onStoreChange)
        return () => {
          audioElementRef.current?.removeEventListener('timeupdate', onStoreChange)
        }
      },
      [audioElementRef],
    ),
    () => {
      if (!audioElementRef.current) {
        return undefined
      }
      return Math.round(audioElementRef.current.currentTime)
    },
    () => undefined,
  )

  const duration = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        audioElementRef.current?.addEventListener('durationchange', onStoreChange)
        return () => {
          audioElementRef.current?.removeEventListener('durationchange', onStoreChange)
        }
      },
      [audioElementRef],
    ),
    () => audioElementRef.current?.duration,
    () => undefined,
  )

  const bufferedSeconds = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        audioElementRef.current?.addEventListener('progress', onStoreChange)
        return () => {
          audioElementRef.current?.removeEventListener('progress', onStoreChange)
        }
      },
      [audioElementRef],
    ),
    () => {
      const audio = audioElementRef.current
      if (!audio) {
        return 0
      }
      if (audio.buffered.length > 0) {
        return audio.buffered.end(audio.buffered.length - 1)
      }
      return 0
    },
    () => undefined,
  )

  const isPlaying = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        audioElementRef.current?.addEventListener('play', onStoreChange)
        audioElementRef.current?.addEventListener('pause', onStoreChange)
        return () => {
          audioElementRef.current?.removeEventListener('play', onStoreChange)
          audioElementRef.current?.removeEventListener('pause', onStoreChange)
        }
      },
      [audioElementRef],
    ),
    () => {
      const audio = audioElementRef.current
      return audio ? !audio.paused : false
    },
    () => undefined,
  )

  const isLoading = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        audioElementRef.current?.addEventListener('playing', onStoreChange)
        audioElementRef.current?.addEventListener('waiting', onStoreChange)
        return () => {
          audioElementRef.current?.removeEventListener('playing', onStoreChange)
          audioElementRef.current?.removeEventListener('waiting', onStoreChange)
        }
      },
      [audioElementRef],
    ),
    () => {
      const audio = audioElementRef.current
      if (!audio) {
        return false
      }
      return audio.networkState === audio.NETWORK_LOADING
    },
    () => undefined,
  )

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
  }
}
