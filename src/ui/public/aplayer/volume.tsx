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
    <div className="aplayer-volume-wrap">
      <button type="button" className="aplayer-icon aplayer-icon-volume-down" onClick={() => onToggleMuted()}>
        {muted || !volume ? (
          <IconVolumeOff />
        ) : volume >= 1 ? (
          <IconVolumeUp />
        ) : (
          <IconVolumeDown />
        )}
      </button>
      <div
        className={cn('aplayer-volume-bar-wrap', {
          'aplayer-volume-bar-wrap-active': isDragging,
        })}
        ref={volumeBarRef}
        onMouseDown={handleMouseDown}
      >
        <div className="aplayer-volume-bar">
          <div
            className="aplayer-volume"
            style={{ backgroundColor: themeColor, height: muted ? 0 : `${volume * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
