import { LoopIcon } from '@/ui/icons/aplayer'
import { cn } from '@/ui/lib/cn'
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
  loop?: boolean
  onToggleLoop?: () => void
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
  loop = false,
  onToggleLoop,
}: PlaybackControlsProps) {
  const playedPercentage = audioDurationSeconds > 0 ? currentTime / audioDurationSeconds : 0
  const bufferedPercentage = audioDurationSeconds > 0 ? bufferedSeconds / audioDurationSeconds : 0

  return (
    <div className="aplayer-controller relative flex items-center">
      <ProgressBar
        themeColor={themeColor}
        playedPercentage={playedPercentage}
        bufferedPercentage={bufferedPercentage}
        onSeek={(progress) => onSeek?.(progress * audioDurationSeconds)}
      />
      <div className="aplayer-time relative right-0 flex h-aplayer-time-height items-center pl-aplayer-time-pad text-aplayer-time text-ink-4 dark:text-ink-4">
        <span className="aplayer-time-inner inline-flex h-aplayer-icon items-center">
          <span className="aplayer-ptime">{formatAudioDuration(currentTime)}</span>
          {' / '}
          <span className="aplayer-dtime">{formatAudioDuration(audioDurationSeconds)}</span>
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
          className={cn(
            'aplayer-icon aplayer-icon-loop flex h-aplayer-icon w-aplayer-icon cursor-pointer items-center justify-center p-0 text-ink-3 transition-all duration-200 hover:text-black dark:text-ink-3 dark:hover:text-ink-1',
            !loop && 'opacity-40',
          )}
          onClick={onToggleLoop}
        >
          <LoopIcon />
        </button>
      </div>
    </div>
  )
}
