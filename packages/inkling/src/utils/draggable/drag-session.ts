// Drag-start session — DragDropHandler's port adapter over the shared
// press-threshold core (@/utils/draggable/press-threshold-session, which it
// shares with the floating panel's drag session). A mousedown on a draggable
// begins a session: the press becomes a drag once the pointer travels past
// DRAG_START_THRESHOLD from the grab point, and is cancelled when the pointer
// is released or a native HTML drag begins first. The temporary listener set
// sits behind the injected listen port; the exactly-once resolution lives in
// the core, with the listener detach sequenced ahead of it here.
// DragDropHandler owns the ports (document listeners, drag initiation).

import { createPressThresholdSession } from '@/utils/draggable/press-threshold-session'

/** Distance in px the pointer must travel from the grab point before a press becomes a drag. */
export const DRAG_START_THRESHOLD = 1

export interface DragSessionPoint {
  x: number
  y: number
}

/** The temporary listeners a pending session needs, handed to the listen port. */
export interface DragStartSessionListeners {
  /** Pointer moved to point. */
  move: (point: DragSessionPoint) => void
  /** Pointer released before the threshold was crossed. */
  release: () => void
  /** A native HTML drag began before the threshold was crossed. */
  nativeDrag: () => void
}

export interface DragStartSessionPorts {
  /** Attach the session's temporary listeners; returns their detach. */
  listen: (listeners: DragStartSessionListeners) => () => void
  /** The press crossed the start threshold — it is now a drag. */
  onStart: () => void
  /** The press ended before crossing the threshold. */
  onCancel?: () => void
}

export interface DragStartSession {
  /** Feed a pointer position; starts the drag once past the threshold. */
  move: (point: DragSessionPoint) => void
  /** End the session before it started (release, native drag, reset, a newer grab). */
  cancel: () => void
  /** Whether the session is still waiting for its start threshold. */
  isPending: () => boolean
}

/**
 * Headless drag-start session: grab point in, threshold policy, then exactly
 * one resolution — onStart or onCancel — with the listeners detached either
 * way (the core's exactly-once guarantee; the detach is sequenced ahead of
 * the resolution). The owner feeds it pointer positions and owns every DOM
 * consequence.
 */
export function createDragStartSession(
  grab: DragSessionPoint,
  { listen, onStart, onCancel }: DragStartSessionPorts,
): DragStartSession {
  // assigned by listen before any listener can fire (the listeners only run
  // once listen has returned), so the resolution always sees the real detach
  let detach: () => void = () => {}
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
