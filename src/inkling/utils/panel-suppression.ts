// The settings panel's drag-lifetime side effects as a headless module; `useFloatingPanel`
// only creates the suppression and wires activate/deactivate to the drag session's effect ports.

export interface PanelSuppressionPorts {
  /** The panel element; null-safe (the panel may unmount mid-drag). */
  getElement: () => HTMLElement | null
  /** Document-unique id for the user-select stylesheet (React's useId). */
  stylesheetId: string
}

export interface PanelSuppression {
  /** Swallows the click that would otherwise land when a drag finishes. */
  cancelClick: (event: Event) => void
  /** Suppress scroll, selection, and pointer events for the drag's duration. */
  activate: () => void
  /** Restore everything; the click-capture removal is deferred a tick so the immediate
   * click event stays suppressed (the drag-out-of-canvas case). */
  deactivate: () => void
  /** Synchronous unmount cleanup: restore scroll/selection/pointer-events and drop the
   * click capture without the deferred timing. */
  dispose: () => void
}

export function createPanelSuppression({ getElement, stylesheetId }: PanelSuppressionPorts): PanelSuppression {
  let originalOverflow = ''

  const cancelClick = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const disableScroll = () => {
    const elem = getElement()
    if (!elem) {
      return
    }
    originalOverflow = elem.style.overflow
    elem.style.overflow = 'hidden'
  }

  const enableScroll = () => {
    const elem = getElement()
    if (elem) {
      elem.style.overflow = originalOverflow
    }
  }

  const disableSelection = () => {
    window.getSelection()?.removeAllRanges()

    const stylesheet = document.createElement('style')
    stylesheet.id = stylesheetId
    document.head.appendChild(stylesheet)
    stylesheet.sheet?.insertRule('* { user-select: none !important; }', 0)
  }

  const enableSelection = () => {
    document.getElementById(stylesheetId)?.remove()
  }

  // Disabling pointer events stops inputs activating when the drag finishes; catching
  // clicks stops handlers that would otherwise close the panel on the finishing click.
  const disablePointerEvents = () => {
    const elem = getElement()
    if (elem) {
      elem.style.pointerEvents = 'none'
    }
    window.addEventListener('click', cancelClick, { capture: true, passive: false })
  }

  const enablePointerEvents = () => {
    const elem = getElement()
    if (elem) {
      elem.style.pointerEvents = ''
    }
    window.removeEventListener('click', cancelClick, { capture: true })
  }

  return {
    cancelClick,
    activate() {
      disableScroll()
      disableSelection()
      disablePointerEvents()
    },
    deactivate() {
      // Removing click suppression immediately re-enables the click in the same event
      // loop, losing the suppression when dragging out of the canvas; defer a tick.
      setTimeout(() => {
        window.removeEventListener('click', cancelClick, { capture: true })
      }, 1)

      enableScroll()
      enableSelection()

      // keep immediate events blocked until the drag end has fully realised
      setTimeout(() => {
        enablePointerEvents()
      }, 5)
    },
    dispose() {
      enableScroll()
      enableSelection()
      enablePointerEvents()
    },
  }
}
