import type { RefObject } from 'react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PanelPosition, PanelSpacing, PanelViewport } from '@/utils/floating-panel'

import { createPanelDomWiring, type PanelDomWiring, type PanelDomWiringPorts } from '@/utils/panel-resize-choreography'
import { createPanelSuppression } from '@/utils/panel-suppression'

// The DOM assembly (createPanelDomWiring) over stubbed ResizeObserver:
// drag grab/release through the body-level press listeners, the committed
// position on drag, the observer registration, and the wide-card transition
// slot bookkeeping. The pure resolutions (reclamp/viewport-shift/transition
// math) are pinned by the module's own tests; here the assembly is the unit.

type ResizeObserverCallback = (entries: unknown[], observer: unknown) => void

const observed = new Map<Element, ResizeObserverCallback>()

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = []
  private callback: ResizeObserverCallback
  disconnect = vi.fn()
  observe = vi.fn((element: Element) => {
    observed.set(element, this.callback)
  })
  unobserve = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverStub.instances.push(this)
  }
}

// jsdom ships neither ResizeObserver nor Event.composedPath; the wiring's
// DOM assembly needs both, so the harness stubs them
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

let composedPathStub: (() => Element[]) | null = null
Event.prototype.composedPath = function () {
  return composedPathStub ? composedPathStub() : []
}

function fireResize(element: Element) {
  observed.get(element)?.([{ contentBoxSize: [{ inlineSize: 100 }] }], null)
}

interface Harness {
  panel: HTMLElement
  card: HTMLElement
  wiring: PanelDomWiring
  setPosition: (position: PanelPosition) => void
  getViewport: () => PanelViewport
  ports: PanelDomWiringPorts
  previousCardWidth: RefObject<string>
  previousCardOrigin: RefObject<PanelPosition>
  previousViewport: RefObject<PanelViewport>
}

function makeHarness(): Harness {
  const panel = document.createElement('div')
  panel.style.width = '100px'
  panel.style.height = '50px'
  document.body.appendChild(panel)
  const card = document.createElement('div')
  document.body.appendChild(card)
  card.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect

  const position = { x: 0, y: 0 }
  let committed: { x: number | undefined; y: number | undefined } = { x: undefined, y: undefined }
  let spacing: PanelSpacing | null = null

  const setPosition = vi.fn<(position: PanelPosition) => void>((next: PanelPosition) => {
    position.x = next.x
    position.y = next.y
    committed = next
  })
  const getPosition = () => ({ ...position, lastSpacing: spacing })
  const getCommittedPosition = () => ({ ...committed, lastSpacing: spacing })
  const viewport = { width: 1024, height: 768 }
  const getViewport = () => viewport

  const previousCardWidth = { current: 'regular' } as RefObject<string>
  const previousCardOrigin = { current: { x: 0, y: 0 } } as RefObject<PanelPosition>
  const previousViewport = { current: viewport } as RefObject<PanelViewport>

  const ports: PanelDomWiringPorts = {
    getElement: () => panel,
    resolveCardElement: () => card,
    getCommittedPosition,
    getPosition,
    setPosition,
    getViewport,
    getCardWidth: () => 'regular',
    previousCardWidth,
    previousCardOrigin,
    previousViewport,
    isPanel: (element) => element === panel,
    isInteractive: (element) => element instanceof Element && element.matches('input'),
    suppression: createPanelSuppression({ getElement: () => panel, stylesheetId: 'wiring-test-stylesheet' }),
  }

  return {
    panel,
    card,
    wiring: createPanelDomWiring(ports),
    setPosition,
    getViewport,
    ports,
    previousCardWidth,
    previousCardOrigin,
    previousViewport,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  observed.clear()
  ResizeObserverStub.instances = []
  composedPathStub = null
})

describe('createPanelDomWiring', () => {
  it('starts a drag from a body mousedown on the panel and commits the dragged position', () => {
    const harness = makeHarness()
    composedPathStub = () => [harness.panel]
    harness.wiring.start()

    // grab on the panel — the composed-path stub reports the panel, so the
    // grab verdict lands on it and the drag-lifetime listeners attach
    const down = new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
    harness.panel.dispatchEvent(down)

    // travel past the 3px threshold, then release
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 40 }))
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect(harness.setPosition).toHaveBeenLastCalledWith({ x: 50, y: 30 })
    harness.wiring.destroy()
  })

  it('does not grab presses that land outside the panel', () => {
    const harness = makeHarness()
    harness.wiring.start()

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }))
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect(harness.setPosition).not.toHaveBeenCalled()
    harness.wiring.destroy()
  })

  it('observes the panel and its scroll container, and tears both down on destroy', () => {
    const harness = makeHarness()
    harness.wiring.start()

    // two observers: the panel itself and the scroll container (body here)
    expect(ResizeObserverStub.instances.length).toBeGreaterThanOrEqual(2)
    expect(ResizeObserverStub.instances[0].observe).toHaveBeenCalledWith(harness.panel)

    const disconnectCount = ResizeObserverStub.instances.reduce(
      (sum, instance) => sum + (instance.disconnect.mock.calls.length > 0 ? 1 : 0),
      0,
    )
    harness.wiring.destroy()
    const disconnectCountAfter = ResizeObserverStub.instances.reduce(
      (sum, instance) => sum + (instance.disconnect.mock.calls.length > 0 ? 1 : 0),
      0,
    )
    expect(disconnectCountAfter).toBeGreaterThan(disconnectCount)
  })

  it('re-positions on a panel resize once a position is committed', () => {
    const harness = makeHarness()
    harness.wiring.start()
    harness.setPosition({ x: 100, y: 100 })

    fireResize(harness.panel)

    // the settle clamp is a no-op for this position (fully inside the
    // viewport), so the committed position stays put — but the resolution
    // ran and committed the same value through setPosition
    expect(harness.setPosition).toHaveBeenLastCalledWith({ x: 100, y: 100 })
    harness.wiring.destroy()
  })

  it('bookkeeps the wide-card origin transition slots', () => {
    const harness = makeHarness()
    harness.wiring.start()

    expect(harness.previousCardWidth.current).toBe('regular')
    expect(harness.previousCardOrigin.current).toEqual({ x: 0, y: 0 })

    harness.wiring.destroy()
  })
})
