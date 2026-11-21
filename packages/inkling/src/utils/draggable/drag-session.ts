import { createPressThresholdSession } from '@kobato/inkling-internal/utils/draggable/press-threshold-session'

export const DRAG_START_THRESHOLD = 1

export interface DragSessionPoint {
  x: number
  y: number
}

export interface DragStartSessionListeners {
  move: (point: DragSessionPoint) => void
  release: () => void
  nativeDrag: () => void
}

export interface DragStartSessionPorts {
  listen: (listeners: DragStartSessionListeners) => () => void
  onStart: () => void
  onCancel?: () => void
}

export interface DragStartSession {
  move: (point: DragSessionPoint) => void
  cancel: () => void
  isPending: () => boolean
}

export function createDragStartSession(
  grab: DragSessionPoint,
  { listen, onStart, onCancel }: DragStartSessionPorts,
): DragStartSession {
  let detach: () => void = () => undefined
  const session = createPressThresholdSession(grab, {
    threshold: DRAG_START_THRESHOLD,
    onBegin: () => {
      detach()
      onStart()
    },
    onCancel: () => {
      detach()
      onCancel?.()
    },
  })
  detach = listen({ move: session.move, release: session.cancel, nativeDrag: session.cancel })
  return session
}
