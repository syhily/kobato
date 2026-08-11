import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { VolumeDownIcon, VolumeOffIcon, VolumeUpIcon } from '@/ui/icons/aplayer'
import { cn } from '@/ui/lib/cn'
import { useDragPercentage } from '@/ui/public/aplayer/hooks/use-drag-percentage'
import { computePercentageOfY } from '@/ui/public/aplayer/utils/compute-percentage'

export type VolumeProps = {
  themeColor: string
  volume: number
  muted: boolean
  onToggleMuted: () => void
  onChangeVolume: (volume: number) => void
}

export function Volume({ themeColor, volume, muted, onToggleMuted, onChangeVolume }: VolumeProps) {
  const volumeBarRef = useRef<HTMLDivElement>(null)
  const { isDragging, handleMouseDown } = useDragPercentage(volumeBarRef, {
    compute: computePercentageOfY,
    onChange: onChangeVolume,
  })

  // The popup bar is hover-revealed, so keyboard volume control lives on the
  // toggle button: ArrowUp/ArrowDown step the volume by 10%.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault()
      onChangeVolume(Math.min(1, volume + 0.1))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault()
      onChangeVolume(Math.max(0, volume - 0.1))
    }
  }

  return (
    <div className="aplayer-volume-wrap group relative ml-aplayer-volume-indent inline-block h-aplayer-icon cursor-pointer">
      <button
        type="button"
        aria-label={muted ? '取消静音' : '静音'}
        aria-pressed={muted}
        className="aplayer-icon aplayer-icon-volume-down flex h-aplayer-icon w-aplayer-icon items-center justify-center p-0 text-ink-3 hover:text-black dark:text-ink-3 dark:hover:text-ink-1"
        onClick={() => onToggleMuted()}
        onKeyDown={handleKeyDown}
      >
        {muted || !volume ? <VolumeOffIcon /> : volume >= 1 ? <VolumeUpIcon /> : <VolumeDownIcon />}
      </button>
      <div
        className={cn(
          'aplayer-volume-bar-wrap absolute -right-aplayer-volume-popup-right bottom-aplayer-volume-popup-bottom z-[99] h-0 w-aplayer-volume-popup-width overflow-hidden transition-all duration-200 ease-in-out group-hover:h-10',
          isDragging && 'h-10',
        )}
        ref={volumeBarRef}
        onMouseDown={handleMouseDown}
      >
        <div className="aplayer-volume-bar absolute right-aplayer-volume-bar-indent bottom-0 h-aplayer-volume-bar-height w-aplayer-volume-bar-track overflow-hidden rounded-aplayer-volume bg-aplayer-bar-loaded dark:bg-ink-4">
          <div
            className="aplayer-volume absolute right-0 bottom-0 w-aplayer-volume-bar-track transition-all duration-100 ease-linear"
            style={{ backgroundColor: themeColor, height: muted ? 0 : `${volume * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
