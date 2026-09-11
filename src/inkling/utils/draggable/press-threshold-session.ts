// Press-threshold session — the shared grab → movement-threshold → begin/cancel
// state machine behind both drag-initiation surfaces: DragDropHandler's
// drag-start session (@/utils/draggable/drag-session) and the floating panel's
// drag session (@/utils/floating-panel's createDragSession) each adapt it to
// their own port shape (a temporary listener set vs. position/effect ports),
// their own threshold, and their own post-begin behaviour. The press begins
// once the pointer travels past the threshold from the grab point on either
// axis; the session resolves exactly once — onBegin or onCancel — and ignores
// further input afterwards. Pure data in, callbacks out, so the threshold
// policy is synchronously unit-testable.

export interface PressThresholdPoint {
  x: number
  y: number
}

export interface PressThresholdSessionPorts {
  /** Distance in px the pointer must travel from the grab point before the press begins. */
  threshold: number
  /** The press crossed the threshold. */
  onBegin: () => void
  /** The press ended before crossing the threshold. */
  onCancel?: () => void
}

export interface PressThresholdSession {
  /** Feed a pointer position; begins the press once past the threshold. */
  move: (point: PressThresholdPoint) => void
  /** End the session before it began (release, native drag, reset, a newer grab). */
  cancel: () => void
  /** Whether the session is still waiting for its threshold. */
  isPending: () => boolean
}

/**
 * Headless press-threshold session: grab point and threshold in, then exactly
 * one resolution — onBegin or onCancel. The owner feeds it pointer positions
 * and owns every consequence of the resolution.
 */
export function createPressThresholdSession(
  grab: PressThresholdPoint,
  { threshold, onBegin, onCancel }: PressThresholdSessionPorts,
): PressThresholdSession {
  let pending = true

  const finish = (began: boolean) => {
    if (!pending) {
      return
    }
    pending = false
    if (began) {
      onBegin()
    } else {
      onCancel?.()
    }
  }

  return {
    move: (point) => {
      if (Math.abs(grab.x - point.x) > threshold || Math.abs(grab.y - point.y) > threshold) {
        finish(true)
      }
    },
    cancel: () => finish(false),
    isPending: () => pending,
  }
}
