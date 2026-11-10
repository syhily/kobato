// The settings panel's grab → drag → release choreography as a headless module;
// `useFloatingPanel` owns every DOM consequence.

import { createDragSession, type DragSessionPorts, type PanelPosition } from '@/inkling/utils/floating-panel'

/** The verdict of a grab's composed-path walk. */
export type PanelGrabVerdict = 'panel' | 'interactive' | 'outside'

export interface PanelGrabVerdictPorts {
  /** Whether the path element is the panel itself. */
  isPanel: (element: unknown) => boolean
  /** Whether the path element swallows the grab (an input, a dropdown trigger). */
  isInteractive: (element: unknown) => boolean
}

/**
 * Walks a press's composed path: the first interactive element swallows the grab;
 * reaching the panel first means the panel itself was grabbed; neither means outside.
 */
export function resolvePanelGrabVerdict(
  path: readonly unknown[],
  { isPanel, isInteractive }: PanelGrabVerdictPorts,
): PanelGrabVerdict {
  for (const element of path) {
    if (isInteractive(element)) {
      return 'interactive'
    }
    if (isPanel(element)) {
      return 'panel'
    }
  }
  return 'outside'
}

/** The listeners active for a drag's lifetime, handed to the listenActive port. */
export interface PanelDragActiveListeners {
  /** Pointer moved to point. */
  move: (point: PanelPosition) => void
  /** Pointer released. */
  end: () => void
}

export interface PanelDragSessionPorts extends DragSessionPorts {
  /** Attach the drag-lifetime listeners once a grab lands on the panel; returns their detach. */
  listenActive: (listeners: PanelDragActiveListeners) => () => void
  /** Whether a composed-path element is the panel itself. */
  isPanel: (element: unknown) => boolean
  /** Whether a composed-path element swallows the grab (an input, a dropdown trigger). */
  isInteractive: (element: unknown) => boolean
}

export interface PanelDragSession {
  /**
   * A press went down at point with this composed path: begins the drag
   * session's press (grab offset recorded), and when the path grabs the
   * panel, activates the drag-lifetime listeners.
   */
  grab: (point: PanelPosition, path: readonly unknown[]) => void
  /** The pointer was released: detaches the active listeners and ends the session (effects unwind either way). */
  release: () => void
  isDragging: () => boolean
  /** Shift the grab offset (panel re-clamped mid-drag after a resize — prevents position jumps). */
  adjustOffset: (deltaX: number, deltaY: number) => void
  /** Unmount teardown: detach any active listeners without touching the effects. */
  destroy: () => void
}

/**
 * The settings panel's drag choreography. Listeners attach at grab time rather than at the
 * threshold crossing, so the travel that crosses the threshold is observed; release detaches
 * them before the session's effects unwind.
 */
export function createPanelDragSession({
  listenActive,
  isPanel,
  isInteractive,
  ...dragSessionPorts
}: PanelDragSessionPorts): PanelDragSession {
  const session = createDragSession(dragSessionPorts)
  let detachActive: (() => void) | null = null

  const release = () => {
    detachActive?.()
    detachActive = null
    session.end()
  }

  return {
    grab(point, path) {
      session.start(point)
      // a second press while the listeners are still attached reuses them (double-attach is a DOM no-op)
      if (detachActive === null && resolvePanelGrabVerdict(path, { isPanel, isInteractive }) === 'panel') {
        detachActive = listenActive({ move: (nextPoint) => session.move(nextPoint), end: release })
      }
    },
    release,
    isDragging: () => session.isDragging(),
    adjustOffset: (deltaX, deltaY) => session.adjustOffset(deltaX, deltaY),
    destroy() {
      detachActive?.()
      detachActive = null
    },
  }
}
