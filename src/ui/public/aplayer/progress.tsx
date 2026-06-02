import { useCallback, useEffect, useRef, useState } from 'react'

import { IconLoading } from '@/ui/public/aplayer/icons/loading'
import { computePercentage } from '@/ui/public/aplayer/utils/compute-percentage'

export type ProgressBarProps = {
  themeColor: string
  bufferedPercentage?: number
  playedPercentage?: number
  onSeek?: (progress: number) => void
}

export function ProgressBar({ themeColor, bufferedPercentage, playedPercentage, onSeek }: ProgressBarProps) {
  const progressBarRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(playedPercentage)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    if (!isDraggingRef.current) {
      setProgress(playedPercentage)
    }
  }, [playedPercentage])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true
      const percentage = computePercentage(e, progressBarRef)
      setProgress(percentage)

      const handleMouseMove = (e: MouseEvent) => {
        const percentage = computePercentage(e, progressBarRef)
        setProgress(percentage)
      }

      const handleMouseUp = (e: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        const percentage = computePercentage(e, progressBarRef)
        setProgress(percentage)
        onSeek?.(percentage)
        isDraggingRef.current = false
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [onSeek],
  )

  return (
    <div ref={progressBarRef} className="aplayer-bar-wrap" onMouseDown={handleMouseDown}>
      <div className="aplayer-bar">
        {typeof bufferedPercentage !== 'undefined' ? (
          <div className="aplayer-loaded" style={{ width: `${bufferedPercentage * 100}%` }} />
        ) : null}
        {typeof progress !== 'undefined' ? (
          <div className="aplayer-played" style={{ width: `${progress * 100}%`, backgroundColor: themeColor }}>
            <span className="aplayer-thumb" style={{ backgroundColor: themeColor }}>
              <span className="aplayer-loading-icon">
                <IconLoading />
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
