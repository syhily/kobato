import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { LoadingIcon } from '@/ui/icons/aplayer'
import { useDragPercentage } from '@/ui/public/aplayer/hooks/use-drag-percentage'
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

  // Keyboard seek: arrows step 5%, Home/End jump to the edges.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onSeek) {
      return
    }
    const current = progress ?? 0
    let next: number | undefined
    if (e.key === 'ArrowLeft') {
      next = Math.max(0, current - 0.05)
    } else if (e.key === 'ArrowRight') {
      next = Math.min(1, current + 0.05)
    } else if (e.key === 'Home') {
      next = 0
    } else if (e.key === 'End') {
      next = 1
    }
    if (next !== undefined) {
      e.preventDefault()
      setProgress(next)
      onSeek(next)
    }
  }

  return (
    <div
      ref={progressBarRef}
      role="slider"
      tabIndex={0}
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((progress ?? 0) * 100)}
      className="aplayer-bar-wrap group ml-aplayer-progress-indent flex-1 cursor-pointer py-1"
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div className="aplayer-bar relative h-0.5 w-full bg-aplayer-bar dark:bg-widget-border">
        {bufferedPercentage !== undefined ? (
          <div
            className="aplayer-loaded absolute top-0 bottom-0 left-0 h-0.5 bg-aplayer-bar-loaded transition-all duration-500 ease-linear dark:bg-ink-4"
            style={{ width: `${bufferedPercentage * 100}%` }}
          />
        ) : null}
        {progress !== undefined ? (
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
