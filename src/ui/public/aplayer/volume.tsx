import { useCallback, useRef, useState } from 'react'

import { cn } from '@/ui/lib/cn'
import { IconVolumeDown } from '@/ui/public/aplayer/icons/volume-down'
import { IconVolumeOff } from '@/ui/public/aplayer/icons/volume-off'
import { IconVolumeUp } from '@/ui/public/aplayer/icons/volume-up'
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
  const [isDragging, setDragging] = useState(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onChangeVolume(computePercentageOfY(e, volumeBarRef))
      setDragging(true)

      const handleMouseMove = (e: MouseEvent) => {
        onChangeVolume(computePercentageOfY(e, volumeBarRef))
      }

      const handleMouseUp = (e: MouseEvent) => {
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('mousemove', handleMouseMove)
        setDragging(false)
        onChangeVolume(computePercentageOfY(e, volumeBarRef))
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [onChangeVolume],
  )

  return (
    <div className="aplayer-volume-wrap group relative ml-aplayer-volume-indent inline-block h-aplayer-icon cursor-pointer">
      <button
        type="button"
        className="aplayer-icon aplayer-icon-volume-down flex h-aplayer-icon w-aplayer-icon items-center justify-center p-0 text-ink-3 hover:text-black dark:text-ink-3 dark:hover:text-ink-1"
        onClick={() => onToggleMuted()}
      >
        {muted || !volume ? <IconVolumeOff /> : volume >= 1 ? <IconVolumeUp /> : <IconVolumeDown />}
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
