import type { ArtistInfo, AudioInfo } from '@kobato/ui/public/aplayer/types'

import { PauseIcon, PlayIcon, RightIcon } from '@kobato/ui/icons/aplayer'
import { cn } from '@kobato/ui/lib/cn'
import { defaultThemeColor } from '@kobato/ui/public/aplayer/constants'
import { PlaybackControls } from '@kobato/ui/public/aplayer/controller'
import { useAudioControl } from '@kobato/ui/public/aplayer/hooks/use-audio-control'
import { useNotice } from '@kobato/ui/public/aplayer/hooks/use-notice'
import { useThemeColor } from '@kobato/ui/public/aplayer/hooks/use-theme-color'
import { Lyrics } from '@kobato/ui/public/aplayer/lyrics'
import { useCallback, useEffect, useRef, useState } from 'react'

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
      <a href={artist.url} target="_blank" rel="noreferrer" className="text-inherit no-underline hover:underline">
        {artist.name ?? 'Audio artist'}
      </a>
    )
  }, [])

  const [mini, setMini] = useState(false)
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
  const hasLrc = Boolean(audio.lrc) && appearance !== 'fixed'

  return (
    <div
      className={cn(
        'aplayer not-prose relative m-aplayer-margin overflow-hidden rounded-sm bg-white font-[Arial,Helvetica,sans-serif] leading-normal shadow-[0_2px_2px_0_rgba(0,0,0,0.07),0_1px_5px_0_rgba(0,0,0,0.1)] select-none dark:rounded-[var(--radius-sm)] dark:bg-surface dark:shadow-[0_0_0_1px_rgb(255_255_255_/_8%)] [&_*]:box-content',
        {
          'aplayer-fixed fixed right-0 bottom-0 left-0 z-[99] m-0 max-w-aplayer-fixed-max overflow-visible shadow-none dark:shadow-none':
            appearance === 'fixed',
          'aplayer-loading': audioControl.isLoading,
          'aplayer-withlrc': hasLrc,
          'aplayer-narrow w-aplayer-art-sm': mini,
        },
      )}
    >
      <div
        ref={bodyRef}
        className={cn('aplayer-body relative', {
          'fixed right-0 bottom-0 left-0 z-[99] m-0 max-w-aplayer-fixed-max bg-white pr-aplayer-miniswitcher-width transition-all duration-300 dark:bg-surface':
            appearance === 'fixed',
          'h-aplayer-art-sm w-aplayer-art-sm': mini,
        })}
      >
        <div
          className={cn(
            'aplayer-pic group relative float-left cursor-pointer bg-cover bg-center transition-all duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]',
            hasLrc ? 'h-aplayer-art-lg w-aplayer-art-lg' : 'h-aplayer-art-sm w-aplayer-art-sm',
          )}
          onClick={handlePlayButtonClick}
          style={{ backgroundImage: `url("${audio.cover}")` }}
        >
          <div
            className={cn(
              'aplayer-button absolute rounded-full bg-black/20 text-white opacity-80 shadow-[0_1px_1px_rgba(0,0,0,0.2)] transition-all duration-100 dark:[filter:brightness(1.35)]',
              {
                'aplayer-play right-1/2 bottom-1/2 -mr-5 -mb-5 flex h-9 w-9 items-center justify-center border-2 border-white':
                  !audioControl.isPlaying,
                'aplayer-pause right-1 bottom-1 h-6 w-6 border-2 border-white': audioControl.isPlaying,
              },
            )}
          >
            {audioControl.isPlaying ? (
              <PauseIcon className="absolute top-1.5 left-1.5 !h-3 !w-3" />
            ) : (
              <PlayIcon className="!h-5 !w-5" />
            )}
          </div>
        </div>
        <div
          className={cn(
            'aplayer-info !box-border',
            hasLrc
              ? 'ml-aplayer-info-gap-lg h-aplayer-art-lg pt-aplayer-info-pad-top-lg pr-aplayer-info-pad-x pb-0'
              : 'ml-aplayer-info-gap-sm h-aplayer-art-sm pt-3.5 pr-aplayer-info-pad-x pb-0 pl-2.5',
            mini && 'hidden',
            appearance === 'fixed' && mini && 'block scale-x-0',
          )}
        >
          <div className="aplayer-music mb-aplayer-music-gap ml-aplayer-music-indent h-5 cursor-default overflow-hidden pb-0.5 text-ellipsis whitespace-nowrap select-text">
            <span className="aplayer-title text-sm dark:text-ink-1">{audio.name ?? 'Audio name'}</span>
            <span className="aplayer-author text-xs text-ink-4 dark:text-ink-4"> - {renderArtist(audio.artist)}</span>
          </div>
          {appearance === 'fixed' ? null : <Lyrics show lrcText={audio.lrc} currentTime={audioControl.currentTime} />}
          <PlaybackControls themeColor={themeColor} control={audioControl} />
        </div>
        <div
          className="aplayer-notice pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded bg-surface-dim px-2.5 py-aplayer-notice-pad-y text-xs text-ink-4 opacity-0 transition-all duration-300 ease-in-out dark:bg-surface-dim dark:text-ink-2"
          style={notice.style}
        >
          {notice.text}
        </div>
        <div
          className="aplayer-miniswitcher absolute top-0 right-0 bottom-0 hidden h-full w-aplayer-miniswitcher-width rounded-r-sm bg-surface-dim dark:bg-surface-dim"
          onClick={() => setMini((prev) => !prev)}
        >
          <button
            type="button"
            className="aplayer-icon h-full w-full rotate-y-180 text-ink-3 transition-all duration-300 hover:text-black dark:text-ink-3 dark:hover:text-ink-1"
          >
            <RightIcon />
          </button>
        </div>
      </div>
      {appearance === 'fixed' && <Lyrics show lrcText={audio.lrc} currentTime={audioControl.currentTime} />}
    </div>
  )
}
