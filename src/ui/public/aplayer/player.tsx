import { useCallback, useEffect, useRef, useState } from 'react'

import type { ArtistInfo, AudioInfo } from '@/ui/public/aplayer/types'

import { cn } from '@/ui/lib/cn'
import { defaultThemeColor } from '@/ui/public/aplayer/constants'
import { PlaybackControls } from '@/ui/public/aplayer/controller'
import { useAudioControl } from '@/ui/public/aplayer/hooks/use-audio-control'
import { useNotice } from '@/ui/public/aplayer/hooks/use-notice'
import { useThemeColor } from '@/ui/public/aplayer/hooks/use-theme-color'
import { IconPause } from '@/ui/public/aplayer/icons/pause'
import { IconPlay } from '@/ui/public/aplayer/icons/play'
import { IconRight } from '@/ui/public/aplayer/icons/right'
import { Lyrics } from '@/ui/public/aplayer/lyrics'

export type APlayerProps = {
  audio: AudioInfo
  theme?: string
  volume?: number
  appearance?: 'normal' | 'fixed'
  autoPlay?: boolean
}

export function APlayer({
  theme = defaultThemeColor,
  audio,
  appearance = 'normal',
  volume = 0.7,
  autoPlay = false,
}: APlayerProps) {
  const [notice, showNotice] = useNotice()

  const audioControl = useAudioControl({
    src: audio.url,
    initialVolume: volume,
    autoPlay,
    onError() {
      showNotice('An audio error has occurred.')
    },
  })

  const handlePlayButtonClick = useCallback(() => {
    audioControl.togglePlay()
  }, [audioControl])

  const renderArtist = useCallback((artist?: string | ArtistInfo) => {
    if (!artist) {
      return 'Audio artist'
    }
    if (typeof artist === 'string') {
      return artist
    }
    if (!artist.url) {
      return artist.name ?? 'Audio artist'
    }
    return (
      <a href={artist.url} target="_blank" rel="noreferrer">
        {artist.name ?? 'Audio artist'}
      </a>
    )
  }, [])

  const [mini, setMini] = useState(false)
  const [displayLyrics, setDisplayLyrics] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (appearance === 'fixed' && bodyRef.current) {
      const bodyElement = bodyRef.current
      bodyElement.style.width = bodyElement.offsetWidth - 18 + 'px'
      return () => {
        bodyElement.removeAttribute('style')
      }
    }
  }, [appearance])

  const themeColor = useThemeColor(audio, theme)

  return (
    <div
      className={cn('aplayer', {
        'aplayer-fixed': appearance === 'fixed',
        'aplayer-loading': audioControl.isLoading,
        'aplayer-withlrc': Boolean(audio.lrc) && appearance !== 'fixed',
        'aplayer-narrow': mini,
      })}
    >
      <div ref={bodyRef} className="aplayer-body">
        <div
          className="aplayer-pic"
          onClick={handlePlayButtonClick}
          style={{ backgroundImage: `url("${audio.cover}")` }}
        >
          <div
            className={cn('aplayer-button', {
              'aplayer-pause': audioControl.isPlaying,
              'aplayer-play': !audioControl.isPlaying,
            })}
          >
            {audioControl.isPlaying ? <IconPause /> : <IconPlay />}
          </div>
        </div>
        <div className="aplayer-info">
          <div className="aplayer-music">
            <span className="aplayer-title">{audio.name ?? 'Audio name'}</span>
            <span className="aplayer-author"> - {renderArtist(audio.artist)}</span>
          </div>
          {appearance === 'fixed' ? null : (
            <Lyrics show={displayLyrics} lrcText={audio.lrc} currentTime={audioControl.currentTime} />
          )}
          <PlaybackControls
            volume={audioControl.volume}
            onChangeVolume={audioControl.setVolume}
            muted={audioControl.muted}
            onToggleMuted={audioControl.toggleMuted}
            themeColor={themeColor}
            currentTime={audioControl.currentTime}
            audioDurationSeconds={audioControl.duration}
            bufferedSeconds={audioControl.bufferedSeconds}
            onSeek={audioControl.seek}
            isPlaying={audioControl.isPlaying}
            onTogglePlay={handlePlayButtonClick}
            showLyrics={displayLyrics}
            onToggleLyrics={() => setDisplayLyrics((prev) => !prev)}
          />
        </div>
        <div className="aplayer-notice" style={notice.style}>
          {notice.text}
        </div>
        <div className="aplayer-miniswitcher" onClick={() => setMini((prev) => !prev)}>
          <button type="button" className="aplayer-icon">
            <IconRight />
          </button>
        </div>
      </div>
      {appearance === 'fixed' && (
        <Lyrics show={displayLyrics} lrcText={audio.lrc} currentTime={audioControl.currentTime} />
      )}
    </div>
  )
}
