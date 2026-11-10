// DragDropHandler's port adapter over the shared press-threshold core (also used by the
// floating panel's drag session). A mousedown on a draggable begins a session; the press
// becomes a drag once the pointer travels past DRAG_START_THRESHOLD, and is cancelled when
// the pointer is released or a native HTML drag begins first.

import { createPressThresholdSession } from '@/inkling/utils/draggable/press-threshold-session'

/** Distance in px the pointer must travel from the grab point before a press becomes a drag. */
export const DRAG_START_THRESHOLD = 1

export interface DragSessionPoint {
  x: number
  y: number
}

/** The temporary listeners a pending session needs, handed to the listen port. */
export interface DragStartSessionListeners {
  move: (point: DragSessionPoint) => void
  /** Pointer released before the threshold was crossed. */
  release: () => void
  /** A native HTML drag began before the threshold was crossed. */
  nativeDrag: () => void
}

export interface DragStartSessionPorts {
  /** Attach the session's temporary listeners; returns their detach. */
  listen: (listeners: DragStartSessionListeners) => () => void
  onStart: () => void
  onCancel?: () => void
}

export interface DragStartSession {
  move: (point: DragSessionPoint) => void
  /** End the session before it started (release, native drag, reset, a newer grab). */
  cancel: () => void
  isPending: () => boolean
}

/**
 * Grab point in, threshold policy out, then exactly one resolution — onStart or onCancel —
 * with the listeners detached either way. The owner feeds it pointer positions and owns
 * every DOM consequence.
 */
export function createDragStartSession(
  grab: DragSessionPoint,
  { listen, onStart, onCancel }: DragStartSessionPorts,
): DragStartSession {
  // Assigned by listen before any listener can fire (listeners only run once listen has
  // returned), so the resolution always sees the real detach.
  let detach: () => void = () => {
    // Placeholder until listen() assigns the real detach below.
  }
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
