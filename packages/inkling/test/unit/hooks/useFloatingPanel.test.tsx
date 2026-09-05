import type { LexicalEditor, NodeKey } from 'lexical'

import { LexicalComposerContext, type LexicalComposerContextWithEditor } from '@lexical/react/LexicalComposerContext'
import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import useFloatingPanel from '@/hooks/useFloatingPanel'

class MockResizeObserver {
  static instances: MockResizeObserver[] = []

  callback: ResizeObserverCallback
  targets: Element[] = []
  disconnectCount = 0

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe(target: Element) {
    this.targets.push(target)
  }

  unobserve(target: Element) {
    this.targets = this.targets.filter((t) => t !== target)
  }

  disconnect() {
    this.disconnectCount += 1
    this.targets = []
  }

  emit(width: number) {
    const entry = {
      target: this.targets[0],
      contentBoxSize: [{ inlineSize: width, blockSize: 0 }],
    } as unknown as ResizeObserverEntry
    this.callback([entry], this)
  }
}

const originalResizeObserver = globalThis.ResizeObserver

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

function Harness({ cardWidth = 'regular' }: { cardWidth?: string }) {
  const cardRef = React.useRef<HTMLDivElement | null>(null)
  const { ref } = useFloatingPanel({ positionToRef: cardRef, cardWidth })
  return (
    <div data-testid="scroll-container" style={{ overflowY: 'auto' }}>
      <div ref={cardRef} data-testid="card" />
      <div ref={ref} data-testid="settings-panel">
        <input data-testid="panel-input" />
      </div>
    </div>
  )
}

function KeyHarnessInner({ cardKey }: { cardKey: NodeKey }) {
  const { ref } = useFloatingPanel({ cardWidth: 'regular', cardKey })
  return <div ref={ref} data-testid="settings-panel" />
}

function KeyHarness({ cardKey, editor }: { cardKey: NodeKey; editor: LexicalEditor }) {
  const composerContextValue = React.useMemo<LexicalComposerContextWithEditor>(
    () => [editor, { getTheme: () => null }],
    [editor],
  )
  return (
    <LexicalComposerContext.Provider value={composerContextValue}>
      <KeyHarnessInner cardKey={cardKey} />
    </LexicalComposerContext.Provider>
  )
}

function findContainerObserver(container: Element) {
  return MockResizeObserver.instances.find((instance) => instance.targets.includes(container))
}

function mousedown(target: Element, x: number, y: number) {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: x, clientY: y }))
}

function mousemove(x: number, y: number) {
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }))
}

function mouseup() {
  window.dispatchEvent(new MouseEvent('mouseup'))
}

describe('useFloatingPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setWindowSize(1024, 768)
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
    MockResizeObserver.instances.length = 0

    // layout fakes: the card sits at (100,100) 200x200, the panel is 320x100
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'card') {
        return new DOMRect(100, 100, 200, 200)
      }
      return new DOMRect(0, 0, 0, 0)
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset?.testid === 'settings-panel' ? 320 : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset?.testid === 'settings-panel' ? 100 : 0
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth')
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight')
    globalThis.ResizeObserver = originalResizeObserver
    MockResizeObserver.instances.length = 0
    document.body.innerHTML = ''
  })

  it('positions the panel right of the card on mount', () => {
    render(<Harness />)
    const panel = screen.getByTestId('settings-panel')

    // visible card height 200 → y = 100 + 100 - 50 = 150, x = 300 + 20 = 320
    expect(panel.style.transform).toBe('translate(320px, 150px)')
  })

  it('centers the panel below the card on mobile viewports', () => {
    setWindowSize(375, 700)
    render(<Harness />)
    const panel = screen.getByTestId('settings-panel')

    expect(panel.style.transform).toBe(`translate(${375 / 2 - 160}px, 320px)`)
  })

  it('resolves the card element from the card key via editor.getElementByKey', () => {
    const cardElement = document.createElement('div')
    const getElementByKey = vi.fn<(key: NodeKey) => HTMLElement | null>(() => cardElement)
    const editor = { getElementByKey } as unknown as LexicalEditor

    render(<KeyHarness cardKey="card-1" editor={editor} />)

    expect(getElementByKey).toHaveBeenCalledWith('card-1')
  })

  it('re-clamps immediately on the leading resize and again when the burst settles', async () => {
    render(<Harness />)
    const panel = screen.getByTestId('settings-panel')
    const scrollContainer = screen.getByTestId('scroll-container')

    const observer = findContainerObserver(scrollContainer)
    expect(observer).toBeDefined()

    // leading call: window 500 → right edge 320+320=640 offscreen → x = 160
    setWindowSize(500, 768)
    observer!.emit(500)
    expect(panel.style.transform).toBe('translate(160px, 150px)')

    // trailing call: only after the debounce settles, with the last width
    setWindowSize(480, 768)
    observer!.emit(480)
    expect(panel.style.transform).toBe('translate(160px, 150px)')

    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(panel.style.transform).toBe('translate(140px, 150px)')
  })

  it('cancels pending trailing resize work on unmount', async () => {
    const { unmount } = render(<Harness />)
    const panel = screen.getByTestId('settings-panel')
    const scrollContainer = screen.getByTestId('scroll-container')
    const observer = findContainerObserver(scrollContainer)

    setWindowSize(500, 768)
    observer!.emit(500)
    expect(panel.style.transform).toBe('translate(160px, 150px)')

    setWindowSize(480, 768)
    observer!.emit(480)
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(panel.style.transform).toBe('translate(160px, 150px)')
  })

  it('drags the panel past the start threshold and restores side effects on release', async () => {
    render(<Harness />)
    const panel = screen.getByTestId('settings-panel')
    expect(panel.style.transform).toBe('translate(320px, 150px)')

    mousedown(panel, 400, 200)
    mousemove(403, 202) // within the 3px threshold
    expect(panel.style.transform).toBe('translate(320px, 150px)')
    expect(document.head.querySelectorAll('style')).toHaveLength(0)

    mousemove(420, 220) // threshold crossed → drag, effects on
    expect(panel.style.transform).toBe('translate(340px, 170px)')
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(panel.style.pointerEvents).toBe('none')
    expect(panel.style.overflow).toBe('hidden')

    mouseup()
    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(document.head.querySelectorAll('style')).toHaveLength(0)
    expect(panel.style.pointerEvents).toBe('')
    expect(panel.style.overflow).toBe('')
  })

  it('does not start a drag from an input inside the panel', () => {
    render(<Harness />)
    const panel = screen.getByTestId('settings-panel')

    mousedown(screen.getByTestId('panel-input'), 400, 200)
    mousemove(450, 250)
    expect(panel.style.transform).toBe('translate(320px, 150px)')
  })

  it('removes its body listeners and resize observers on unmount', () => {
    const removeSpy = vi.spyOn(document.body, 'removeEventListener')
    const { unmount } = render(<Harness />)

    unmount()

    const removedTypes = removeSpy.mock.calls.map((call) => call[0])
    expect(removedTypes).toContain('mousedown')
    expect(removedTypes).toContain('touchstart')
    expect(MockResizeObserver.instances.every((instance) => instance.disconnectCount > 0)).toBe(true)
  })
})
