import { useDragPercentage } from '@kobato/editor/engine/aplayer/hooks/use-drag-percentage'
import { computePercentage } from '@kobato/editor/engine/aplayer/utils/compute-percentage'
import { LoadingIcon } from '@kobato/editor/engine/icons/aplayer'
import { useEffect, useRef, useState } from 'react'

export type ProgressBarProps = {
  themeColor: string
  bufferedPercentage?: number
  playedPercentage?: number
  onSeek?: (progress: number) => void
}

export function ProgressBar({ themeColor, bufferedPercentage, playedPercentage, onSeek }: ProgressBarProps) {
  const progressBarRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(playedPercentage)
  const { isDraggingRef, handleMouseDown } = useDragPercentage(progressBarRef, {
    compute: computePercentage,
    onChange: setProgress,
    onCommit: onSeek,
  })

  useEffect(() => {
    if (!isDraggingRef.current) {
      setProgress(playedPercentage)
    }
  }, [playedPercentage, isDraggingRef])

  return (
    <div
      ref={progressBarRef}
      className="aplayer-bar-wrap group ml-aplayer-progress-indent flex-1 cursor-pointer py-1"
      onMouseDown={handleMouseDown}
    >
      <div className="aplayer-bar relative h-0.5 w-full bg-aplayer-bar dark:bg-widget-border">
        {typeof bufferedPercentage !== 'undefined' ? (
          <div
            className="aplayer-loaded absolute top-0 bottom-0 left-0 h-0.5 bg-aplayer-bar-loaded transition-all duration-500 ease-linear dark:bg-ink-4"
            style={{ width: `${bufferedPercentage * 100}%` }}
          />
        ) : null}
        {typeof progress !== 'undefined' ? (
          <div
            className="aplayer-played absolute top-0 bottom-0 left-0 h-0.5"
            style={{ width: `${progress * 100}%`, backgroundColor: themeColor }}
          >
            <span
              className="aplayer-thumb absolute top-0 right-aplayer-thumb-offset -mt-1 -mr-2.5 h-2.5 w-2.5 scale-0 cursor-pointer rounded-full transition-all duration-300 ease-in-out group-hover:scale-100"
              style={{ backgroundColor: themeColor }}
            >
              <span className="aplayer-loading-icon hidden animate-spin">
                <LoadingIcon />
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
