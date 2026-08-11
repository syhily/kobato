import type { AudioControl } from '@/ui/public/aplayer/hooks/use-audio-control'

import { LoopIcon } from '@/ui/icons/aplayer'
import { cn } from '@/ui/lib/cn'
import { ProgressBar } from '@/ui/public/aplayer/progress'
import { formatAudioDuration } from '@/ui/public/aplayer/utils/format-duration'
import { Volume } from '@/ui/public/aplayer/volume'

export type PlaybackControlsProps = {
  themeColor: string
  control: AudioControl
}

export function PlaybackControls({ themeColor, control }: PlaybackControlsProps) {
  const playedPercentage = control.duration > 0 ? control.currentTime / control.duration : 0
  const bufferedPercentage = control.duration > 0 ? control.bufferedSeconds / control.duration : 0

  return (
    <div className="aplayer-controller relative flex items-center">
      <ProgressBar
        themeColor={themeColor}
        playedPercentage={playedPercentage}
        bufferedPercentage={bufferedPercentage}
        onSeek={(progress) => control.seek(progress * control.duration)}
      />
      <div className="aplayer-time relative right-0 flex h-aplayer-time-height items-center pl-aplayer-time-pad text-aplayer-time text-ink-4 dark:text-ink-4">
        <span className="aplayer-time-inner inline-flex h-aplayer-icon items-center">
          <span className="aplayer-ptime">{formatAudioDuration(control.currentTime)}</span>
          {' / '}
          <span className="aplayer-dtime">{formatAudioDuration(control.duration)}</span>
        </span>
        <Volume
          themeColor={themeColor}
          volume={control.volume}
          muted={control.muted}
          onToggleMuted={control.toggleMuted}
          onChangeVolume={control.setVolume}
        />
        <button
          type="button"
          aria-label={control.loop ? '关闭循环播放' : '开启循环播放'}
          aria-pressed={control.loop}
          className={cn(
            'aplayer-icon aplayer-icon-loop flex h-aplayer-icon w-aplayer-icon cursor-pointer items-center justify-center p-0 text-ink-3 transition-all duration-200 hover:text-black dark:text-ink-3 dark:hover:text-ink-1',
            !control.loop && 'opacity-40',
          )}
          onClick={control.toggleLoop}
        >
          <LoopIcon />
        </button>
      </div>
    </div>
  )
}
