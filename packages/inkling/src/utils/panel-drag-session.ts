import {
  createDragSession,
  type DragSessionPorts,
  type PanelPosition,
} from '@kobato/inkling-internal/utils/floating-panel'

export type PanelGrabVerdict = 'panel' | 'interactive' | 'outside'

export interface PanelGrabVerdictPorts {
  isPanel: (element: unknown) => boolean

  isInteractive: (element: unknown) => boolean
}

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

export interface PanelDragActiveListeners {
  move: (point: PanelPosition) => void
  end: () => void
}

export interface PanelDragSessionPorts extends DragSessionPorts {
  listenActive: (listeners: PanelDragActiveListeners) => () => void

  isPanel: (element: unknown) => boolean
  isInteractive: (element: unknown) => boolean
}

export interface PanelDragSession {
  grab: (point: PanelPosition, path: readonly unknown[]) => void

  release: () => void
  isDragging: () => boolean
  adjustOffset: (deltaX: number, deltaY: number) => void
  destroy: () => void
}

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
