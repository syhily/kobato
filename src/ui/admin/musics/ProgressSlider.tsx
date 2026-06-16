import { useCallback, useRef, useState } from 'react'

import { cn } from '@/ui/lib/cn'

export interface ProgressSliderProps {
  value: number
  max: number
  onChange: (value: number) => void
  accent?: string
  className?: string
  ariaLabel?: string
  orientation?: 'horizontal' | 'vertical'
}

export function ProgressSlider({
  value,
  max,
  onChange,
  accent = 'var(--brand)',
  className = '',
  ariaLabel,
  orientation = 'horizontal',
}: ProgressSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)
  const [dragging, setDragging] = useState(false)

  const pct = max > 0 ? (value / max) * 100 : 0
  const isVertical = orientation === 'vertical'

  const computeValueFromEvent = useCallback(
    (clientX: number, clientY: number): number => {
      const track = trackRef.current
      if (!track) {
        return value
      }
      const rect = track.getBoundingClientRect()
      if (isVertical) {
        const raw = 1 - (clientY - rect.top) / rect.height
        const clamped = Math.max(0, Math.min(1, raw))
        return clamped * max
      }
      const raw = (clientX - rect.left) / rect.width
      const clamped = Math.max(0, Math.min(1, raw))
      return clamped * max
    },
    [max, value, isVertical],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      setDragging(true)
      const newValue = computeValueFromEvent(e.clientX, e.clientY)
      onChange(newValue)

      const controller = new AbortController()
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const v = computeValueFromEvent(moveEvent.clientX, moveEvent.clientY)
        onChange(v)
      }

      const handlePointerUp = () => {
        controller.abort()
        setDragging(false)
      }

      window.addEventListener('pointermove', handlePointerMove, { signal: controller.signal })
      window.addEventListener('pointerup', handlePointerUp, { signal: controller.signal })
      window.addEventListener('pointercancel', handlePointerUp, { signal: controller.signal })
    },
    [computeValueFromEvent, onChange],
  )

  return (
    <div
      ref={trackRef}
      className={cn(
        'group relative cursor-pointer rounded-full bg-line-muted',
        isVertical ? 'h-full w-1' : 'h-1 w-full',
        className,
      )}
      onPointerDown={handlePointerDown}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      role="slider"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = max / 100
        if (isVertical) {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            onChange(Math.min(max, value + step))
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            onChange(Math.max(0, value - step))
          }
        } else {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            onChange(Math.max(0, value - step))
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            onChange(Math.min(max, value + step))
          }
        }
      }}
    >
      {/* Filled portion */}
      <div
        className="absolute rounded-full"
        style={
          isVertical
            ? { bottom: '0', left: '0', width: '100%', height: `${pct}%`, backgroundColor: accent }
            : { top: '0', left: '0', height: '100%', width: `${pct}%`, backgroundColor: accent }
        }
      />

      {/* Thumb */}
      <div
        className={cn(
          'absolute rounded-full bg-ink-1 opacity-0 transition-opacity',
          (hovering || dragging) && 'opacity-100',
        )}
        style={
          isVertical
            ? {
                left: '50%',
                bottom: `calc(${pct}% - 6px)`,
                width: '12px',
                height: '12px',
                transform: 'translateX(-50%)',
              }
            : {
                top: '50%',
                left: `calc(${pct}% - 6px)`,
                width: '12px',
                height: '12px',
                transform: 'translateY(-50%)',
              }
        }
      />
    </div>
  )
}
