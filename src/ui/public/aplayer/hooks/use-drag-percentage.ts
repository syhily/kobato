import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'

import { useCallback, useRef, useState } from 'react'

/** Bar geometry: pointer position → clamped 0..1; progress bar uses the X-axis
 *  variant, volume bar the Y-axis one. */
export type DragPercentageGeometry = (
  event: Pick<MouseEvent, 'clientX' | 'clientY'>,
  ref: RefObject<HTMLDivElement | null>,
) => number

export interface UseDragPercentageOptions {
  compute: DragPercentageGeometry
  /** Fires on mousedown, every mousemove, and once more with the final percentage on mouseup. */
  onChange: (percentage: number) => void
  /** Fires once on mouseup with the final percentage (seek semantics). */
  onCommit?: (percentage: number) => void
}

/** Shared drag machine for the aplayer bars: document-level mousemove/mouseup behind
 *  an AbortController. `isDraggingRef` mirrors `isDragging` for effects that must not re-subscribe. */
export function useDragPercentage(
  ref: RefObject<HTMLDivElement | null>,
  { compute, onChange, onCommit }: UseDragPercentageOptions,
) {
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      isDraggingRef.current = true
      setIsDragging(true)
      onChange(compute(e, ref))

      const controller = new AbortController()
      const handleMouseMove = (moveEvent: MouseEvent) => {
        onChange(compute(moveEvent, ref))
      }
      const handleMouseUp = (upEvent: MouseEvent) => {
        controller.abort()
        const percentage = compute(upEvent, ref)
        onChange(percentage)
        onCommit?.(percentage)
        isDraggingRef.current = false
        setIsDragging(false)
      }

      document.addEventListener('mousemove', handleMouseMove, { signal: controller.signal })
      document.addEventListener('mouseup', handleMouseUp, { signal: controller.signal })
    },
    [compute, onChange, onCommit, ref],
  )

  return { isDragging, isDraggingRef, handleMouseDown }
}
