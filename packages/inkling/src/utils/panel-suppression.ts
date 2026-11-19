export interface PanelSuppressionPorts {
  getElement: () => HTMLElement | null

  stylesheetId: string
}

export interface PanelSuppression {
  cancelClick: (event: Event) => void

  activate: () => void

  deactivate: () => void
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
      setTimeout(() => {
        window.removeEventListener('click', cancelClick, { capture: true })
      }, 1)

      enableScroll()
      enableSelection()

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
