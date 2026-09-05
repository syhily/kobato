// Panel drag suppression — the drag-lifetime side effects of the settings
// panel as a headless module: the click-capture suppression (a click after
// the drag finishes must not reach panel-closing handlers), scroll locking
// (body overflow swap), the user-select stylesheet, and pointer-event
// disabling (inputs must not activate when the drag ends). The React adapter
// (@/hooks/useFloatingPanel) owns none of this: it creates the suppression
// once and hands activate/deactivate to the drag session's effect ports.
// Every DOM read goes through the injected getElement port, so the module is
// testable without a mounted panel.

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
  /** Restore everything; the click-capture removal is deferred a tick so the
   * immediate click event stays suppressed (the drag-out-of-canvas case). */
  deactivate: () => void
  /** Synchronous unmount cleanup: restore scroll/selection/pointer-events and
   * drop the click capture without the deferred timing (the adapter calls
   * this from its destroy path as a belt-and-braces recovery). */
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

  // disabling pointer events prevents inputs being activated when drag finishes,
  // preventing clicks stops any event handlers that may otherwise result in the
  // panel being closed when the drag finishes
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
      // Removing click suppression immediately re-enables the click behind in the
      // same event loop, losing the suppression when dragging out of the canvas.
      // The next tick stops the immediate click event firing when finishing drag.
      setTimeout(() => {
        window.removeEventListener('click', cancelClick, { capture: true })
      }, 1)

      enableScroll()
      enableSelection()

      // timeout required so immediate events stay blocked until the drag end has fully realised
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
