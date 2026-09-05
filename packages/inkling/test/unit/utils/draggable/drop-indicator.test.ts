import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DROP_INDICATOR_SELECTOR } from '@/utils/draggable/draggable-constants'
import { DropIndicator, type DropIndicatorGeometry } from '@/utils/draggable/drop-indicator'

// a droppable at (20, 100), 200x50, inside an offset parent whose viewport
// position is (5, 10) — the indicator position is the droppable offset box
// minus the parent position
const droppableBox = { top: 100, left: 20, width: 200, height: 50 }
const parentPosition = { top: 10, left: 5 }

function createIndicator() {
  const editorContainer = document.createElement('div')
  document.body.appendChild(editorContainer)

  const geometry: DropIndicatorGeometry = {
    getDroppableBox: vi.fn(() => droppableBox),
    getParentPosition: vi.fn(() => parentPosition),
  }
  const indicator = new DropIndicator({ editorContainerElement: editorContainer, geometry })
  indicator.attach()

  const element = editorContainer.querySelector<HTMLElement>(DROP_INDICATOR_SELECTOR)
  if (!element) {
    throw new Error('expected the indicator to be attached')
  }

  const droppable = document.createElement('div')
  return { indicator, element, droppable, editorContainer, geometry }
}

describe('DropIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('attaches the indicator element to the editor container', () => {
    const { element, editorContainer } = createIndicator()

    expect(editorContainer.contains(element)).toBe(true)
    expect(element.style.opacity).toBe('0')
    expect(element.style.pointerEvents).toBe('none')
  })

  it('keeps its own element across attaches while it is connected', () => {
    const { indicator, element } = createIndicator()

    indicator.attach()

    expect(indicator.element).toBe(element)
    expect(document.querySelectorAll(DROP_INDICATOR_SELECTOR)).toHaveLength(1)
  })

  it('gives each indicator its own element inside its own container', () => {
    const first = createIndicator()
    const second = createIndicator()

    // two editors on one page: neither adopts the other's element
    expect(first.element).not.toBe(second.element)
    expect(first.editorContainer.contains(first.element)).toBe(true)
    expect(second.editorContainer.contains(second.element)).toBe(true)
    expect(document.querySelectorAll(DROP_INDICATOR_SELECTOR)).toHaveLength(2)
  })

  it('re-appends its own element when it was removed from the container', () => {
    const { indicator, element, editorContainer } = createIndicator()

    element.remove()
    indicator.attach()

    expect(indicator.element).toBe(element)
    expect(editorContainer.contains(element)).toBe(true)
  })

  it('positions the indicator above the droppable for a top position', () => {
    const { indicator, element, droppable } = createIndicator()

    indicator.show(droppable, 'top-left')
    vi.advanceTimersByTime(150)

    expect(element.style.width).toBe('200px')
    expect(element.style.height).toBe('4px')
    // left: 20 - 5, top: 100 - 2 (above the top edge) - 10
    expect(element.style.left).toBe('15px')
    expect(element.style.top).toBe('88px')
    expect(element.style.opacity).toBe('1')
  })

  it('positions the indicator below the droppable for a bottom position', () => {
    const { indicator, element, droppable } = createIndicator()

    indicator.show(droppable, 'bottom-right')
    vi.advanceTimersByTime(150)

    // top: 100 + 50 - 2 (below the bottom edge) - 10
    expect(element.style.top).toBe('138px')
    expect(element.style.opacity).toBe('1')
  })

  it('waits 150ms before re-positioning when the target moved', () => {
    const { indicator, element, droppable } = createIndicator()

    indicator.show(droppable, 'top-left')

    expect(element.style.opacity).toBe('0')
    expect(element.style.left).toBe('')

    vi.advanceTimersByTime(149)
    expect(element.style.left).toBe('')
    expect(element.style.opacity).toBe('0')

    vi.advanceTimersByTime(1)
    expect(element.style.left).toBe('15px')
    expect(element.style.top).toBe('88px')
    expect(element.style.opacity).toBe('1')
  })

  it('re-shows immediately without a re-position timeout when the target has not moved', () => {
    const { indicator, element, droppable, geometry } = createIndicator()

    indicator.show(droppable, 'top-left')
    vi.advanceTimersByTime(150)
    expect(element.style.opacity).toBe('1')

    // sub-pixel shift within the +-1px tolerance: not a move
    geometry.getDroppableBox = vi.fn(() => ({
      ...droppableBox,
      top: droppableBox.top + 0.6,
      left: droppableBox.left - 0.4,
    }))
    indicator.show(droppable, 'top-left')

    expect(element.style.opacity).toBe('1')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('hide cancels a pending re-position and hides the indicator', () => {
    const { indicator, element, droppable } = createIndicator()

    indicator.show(droppable, 'top-left')
    expect(vi.getTimerCount()).toBe(1)

    indicator.hide()

    expect(vi.getTimerCount()).toBe(0)
    expect(element.style.opacity).toBe('0')

    // the cancelled re-position never lands
    vi.advanceTimersByTime(1000)
    expect(element.style.left).toBe('')
  })

  it('destroy removes the element and cancels a pending re-position', () => {
    const { indicator, element, droppable, editorContainer } = createIndicator()

    indicator.show(droppable, 'top-left')
    indicator.destroy()

    expect(vi.getTimerCount()).toBe(0)
    expect(editorContainer.contains(element)).toBe(false)
  })
})
