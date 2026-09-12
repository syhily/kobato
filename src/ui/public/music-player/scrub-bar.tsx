import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { cn } from '@/ui/lib/cn'

export type ScrubBarProps = {
  /** 0..1 */
  value: number
  /** Live preview while dragging; the parent may mirror it into the UI. */
  onScrub?: (value: number) => void
  /** Committed value on pointer-up and on keyboard steps (seek semantics). */
  onSeek: (value: number) => void
  ariaLabel: string
  className?: string
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * A minimal pointer/keyboard scrub bar (progress, volume). Pointer capture
 * keeps the drag alive outside the bar; arrows step 5%, Home/End jump.
 */
export function ScrubBar({ value, onScrub, onSeek, ariaLabel, className }: ScrubBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [dragValue, setDragValue] = useState<number | null>(null)

  const percentageFromEvent = useCallback((event: { clientX: number }): number => {
    const bar = barRef.current
    if (!bar) {
      return 0
    }
    const rect = bar.getBoundingClientRect()
    return rect.width === 0 ? 0 : clamp01((event.clientX - rect.left) / rect.width)
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      const next = percentageFromEvent(event)
      setDragValue(next)
      onScrub?.(next)
    },
    [onScrub, percentageFromEvent],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragValue === null) {
        return
      }
      const next = percentageFromEvent(event)
      setDragValue(next)
      onScrub?.(next)
    },
    [dragValue, onScrub, percentageFromEvent],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragValue === null) {
        return
      }
      const next = percentageFromEvent(event)
      setDragValue(null)
      onSeek(next)
    },
    [dragValue, onSeek, percentageFromEvent],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const current = dragValue ?? value
      let next: number | undefined
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        next = clamp01(Math.round((current - 0.05) * 100) / 100)
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        next = clamp01(Math.round((current + 0.05) * 100) / 100)
      } else if (event.key === 'Home') {
        next = 0
      } else if (event.key === 'End') {
        next = 1
      }
      if (next !== undefined) {
        event.preventDefault()
        event.stopPropagation()
        onSeek(next)
      }
    },
    [dragValue, value, onSeek],
  )

  const shown = dragValue ?? value

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      className={cn('group/scrub flex cursor-pointer touch-none items-center py-1.5', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <div className="relative h-1 w-full rounded-full bg-surface-dim">
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${shown * 100}%` }} />
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-0 shadow-sm transition-opacity group-hover/scrub:opacity-100 group-focus-visible/scrub:opacity-100"
          style={{ left: `${shown * 100}%` }}
        />
      </div>
    </div>
  )
}
