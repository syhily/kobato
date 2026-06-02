import { cn } from '@/ui/lib/cn'
import { IconLrc } from '@/ui/public/aplayer/icons/lrc'
import { IconPause } from '@/ui/public/aplayer/icons/pause'
import { IconPlay } from '@/ui/public/aplayer/icons/play'
import { ProgressBar } from '@/ui/public/aplayer/progress'
import { formatAudioDuration } from '@/ui/public/aplayer/utils/format-duration'
import { Volume } from '@/ui/public/aplayer/volume'

export type PlaybackControlsProps = {
  themeColor: string
  volume: number
  onChangeVolume: (volume: number) => void
  muted: boolean
  currentTime: number
  audioDurationSeconds: number
  bufferedSeconds: number
  onToggleMuted: () => void
  onSeek?: (second: number) => void
  isPlaying: boolean
  onTogglePlay?: () => void
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
  onToggleMuted,
  onSeek,
  isPlaying,
  onTogglePlay,
  showLyrics = true,
  onToggleLyrics,
}: PlaybackControlsProps) {
  const playedPercentage = audioDurationSeconds > 0 ? currentTime / audioDurationSeconds : 0
  const bufferedPercentage = audioDurationSeconds > 0 ? bufferedSeconds / audioDurationSeconds : 0

  return (
    <div className="aplayer-controller">
      <ProgressBar
        themeColor={themeColor}
        playedPercentage={playedPercentage}
        bufferedPercentage={bufferedPercentage}
        onSeek={(progress) => onSeek?.(progress * audioDurationSeconds)}
      />
      <div className="aplayer-time">
        <span className="aplayer-time-inner">
          <span className="aplayer-ptime">{formatAudioDuration(currentTime)}</span>
          {' / '}
          <span className="aplayer-dtime">{formatAudioDuration(audioDurationSeconds)}</span>
        </span>
        <span className="aplayer-icon aplayer-icon-play" onClick={onTogglePlay}>
          {isPlaying ? <IconPause /> : <IconPlay />}
        </span>
        <Volume
          themeColor={themeColor}
          volume={volume}
          muted={muted}
          onToggleMuted={onToggleMuted}
          onChangeVolume={onChangeVolume}
        />
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
