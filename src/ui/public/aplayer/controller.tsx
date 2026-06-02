import { useCallback } from 'react'

import { cn } from '@/ui/lib/cn'

import { IconLrc } from '@/ui/public/aplayer/icons/lrc'
import { IconLoopAll } from '@/ui/public/aplayer/icons/loop-all'
import { IconLoopNone } from '@/ui/public/aplayer/icons/loop-none'
import { IconLoopOne } from '@/ui/public/aplayer/icons/loop-one'
import { IconMenu } from '@/ui/public/aplayer/icons/menu'
import { IconOrderList } from '@/ui/public/aplayer/icons/order-list'
import { IconOrderRandom } from '@/ui/public/aplayer/icons/order-random'
import { IconPause } from '@/ui/public/aplayer/icons/pause'
import { IconPlay } from '@/ui/public/aplayer/icons/play'
import { IconSkip } from '@/ui/public/aplayer/icons/skip'
import type { PlaylistLoop, PlaylistOrder } from '@/ui/public/aplayer/hooks/use-playlist'
import { ProgressBar } from '@/ui/public/aplayer/progress'
import { formatAudioDuration } from '@/ui/public/aplayer/utils/format-duration'
import { Volume } from '@/ui/public/aplayer/volume'

export type PlaybackControlsProps = {
  themeColor: string
  volume: number
  onChangeVolume: (volume: number) => void
  muted: boolean
  currentTime: number | undefined
  audioDurationSeconds: number | undefined
  bufferedSeconds: number | undefined
  onToggleMenu?: () => void
  onToggleMuted: () => void
  order: PlaylistOrder
  onOrderChange: (order: PlaylistOrder) => void
  loop: PlaylistLoop
  onLoopChange: (loop: PlaylistLoop) => void
  onSeek?: (second: number) => void
  isPlaying: boolean
  onTogglePlay?: () => void
  onSkipForward?: () => void
  onSkipBack?: () => void
  showLyrics?: boolean
  onToggleLyrics?: () => void
}

export function PlaybackControls({
  themeColor,
  volume,
  onChangeVolume,
  muted,
  currentTime,
  audioDurationSeconds,
  bufferedSeconds,
  onToggleMenu,
  onToggleMuted,
  order,
  onOrderChange,
  loop,
  onLoopChange,
  onSeek,
  isPlaying,
  onTogglePlay,
  onSkipForward,
  onSkipBack,
  showLyrics = true,
  onToggleLyrics,
}: PlaybackControlsProps) {
  const handleOrderButtonClick = useCallback(() => {
    const nextOrder: PlaylistOrder = ({ list: 'random', random: 'list' } as const)[order]
    onOrderChange(nextOrder)
  }, [order, onOrderChange])

  const handleLoopButtonClick = useCallback(() => {
    const nextLoop: PlaylistLoop = ({ all: 'one', one: 'none', none: 'all' } as const)[loop]
    onLoopChange(nextLoop)
  }, [loop, onLoopChange])

  return (
    <div className="aplayer-controller">
      <ProgressBar
        themeColor={themeColor}
        playedPercentage={
          typeof currentTime === 'undefined' || typeof audioDurationSeconds === 'undefined'
            ? undefined
            : currentTime / audioDurationSeconds
        }
        bufferedPercentage={
          typeof bufferedSeconds === 'undefined' || typeof audioDurationSeconds === 'undefined'
            ? undefined
            : bufferedSeconds / audioDurationSeconds
        }
        onSeek={(progress) => onSeek?.(progress * (audioDurationSeconds ?? 0))}
      />
      <div className="aplayer-time">
        <span className="aplayer-time-inner">
          <span className="aplayer-ptime">{formatAudioDuration(currentTime)}</span>
          {' / '}
          <span className="aplayer-dtime">{formatAudioDuration(audioDurationSeconds)}</span>
        </span>
        <span className="aplayer-icon aplayer-icon-back" onClick={onSkipBack}>
          <IconSkip />
        </span>
        <span className="aplayer-icon aplayer-icon-play" onClick={onTogglePlay}>
          {isPlaying ? <IconPause /> : <IconPlay />}
        </span>
        <span className="aplayer-icon aplayer-icon-forward" onClick={onSkipForward}>
          <IconSkip />
        </span>
        <Volume
          themeColor={themeColor}
          volume={volume}
          muted={muted}
          onToggleMuted={onToggleMuted}
          onChangeVolume={onChangeVolume}
        />
        <button type="button" className="aplayer-icon aplayer-icon-order" onClick={handleOrderButtonClick}>
          {{ list: <IconOrderList />, random: <IconOrderRandom /> }[order]}
        </button>
        <button type="button" className="aplayer-icon aplayer-icon-loop" onClick={handleLoopButtonClick}>
          {{ all: <IconLoopAll />, one: <IconLoopOne />, none: <IconLoopNone /> }[loop]}
        </button>
        <button type="button" className="aplayer-icon aplayer-icon-menu" onClick={() => onToggleMenu?.()}>
          <IconMenu />
        </button>
        <button
          type="button"
          className={cn('aplayer-icon aplayer-icon-lrc', {
            'aplayer-icon-lrc-inactivity': !showLyrics,
          })}
          onClick={onToggleLyrics}
        >
          <IconLrc />
        </button>
      </div>
    </div>
  )
}
