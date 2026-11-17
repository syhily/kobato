// The shared grab → movement-threshold → begin/cancel state machine behind both
// drag-initiation surfaces (DragDropHandler's drag-start session and the floating panel's
// drag session, each adapting it to its own ports).

export interface PressThresholdPoint {
  x: number
  y: number
}

export interface PressThresholdSessionPorts {
  /** Distance in px the pointer must travel from the grab point before the press begins. */
  threshold: number
  onBegin: () => void
  onCancel?: () => void
}

export interface PressThresholdSession {
  move: (point: PressThresholdPoint) => void
  /** End the session before it began (release, native drag, reset, a newer grab). */
  cancel: () => void
  isPending: () => boolean
}

/**
 * Grab point and threshold in, then exactly one resolution — onBegin or onCancel. The
 * owner feeds it pointer positions and owns every consequence.
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
