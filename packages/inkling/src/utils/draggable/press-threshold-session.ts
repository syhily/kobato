export interface PressThresholdPoint {
  x: number
  y: number
}

export interface PressThresholdSessionPorts {
  threshold: number
  onBegin: () => void
  onCancel?: () => void
}

export interface PressThresholdSession {
  move: (point: PressThresholdPoint) => void
  cancel: () => void
  isPending: () => boolean
}

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
