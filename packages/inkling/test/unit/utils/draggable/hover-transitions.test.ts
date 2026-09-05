import { describe, expect, it } from 'vitest'

import {
  type HoverFrame,
  type HoverState,
  initialHoverState,
  resolveDroppablePosition,
  resolveHoverTransition,
} from '@/utils/draggable/hover-transitions'

// the transition matrix for the drag hover machine: frames and states are
// plain data (jsdom elements for identity/containment), so every scenario
// is a synchronous table row

interface FakeContainer {
  name: string
}

function frame(overrides: Partial<HoverFrame<FakeContainer>>): HoverFrame<FakeContainer> {
  return {
    containerElem: null,
    container: null,
    droppableElem: null,
    droppableRect: null,
    mouse: { x: 0, y: 0 },
    ...overrides,
  }
}

function state(overrides: Partial<HoverState<FakeContainer>>): HoverState<FakeContainer> {
  return { ...initialHoverState(), ...overrides }
}

// a container element owning two droppables (containment powers the
// dead-area rule)
function createScene() {
  const containerElem = document.createElement('div')
  const droppableA = document.createElement('div')
  const droppableB = document.createElement('div')
  containerElem.append(droppableA, droppableB)
  const otherContainerElem = document.createElement('div')
  const otherDroppable = document.createElement('div')
  otherContainerElem.append(otherDroppable)
  const container: FakeContainer = { name: 'container' }
  const otherContainer: FakeContainer = { name: 'other' }
  return { containerElem, droppableA, droppableB, otherContainerElem, otherDroppable, container, otherContainer }
}

const RECT = { x: 0, y: 0, width: 100, height: 40 }

describe('resolveDroppablePosition', () => {
  it.each([
    [{ x: 10, y: 10 }, 'top-left'],
    [{ x: 90, y: 10 }, 'top-right'],
    [{ x: 10, y: 30 }, 'bottom-left'],
    [{ x: 90, y: 30 }, 'bottom-right'],
    // exact halves fall to bottom/right (the < comparison)
    [{ x: 50, y: 20 }, 'bottom-right'],
  ] as const)('maps mouse %o to %s', (mouse, expected) => {
    expect(resolveDroppablePosition(RECT, mouse)).toBe(expected)
  })
})

describe('resolveHoverTransition', () => {
  it('enters a container', () => {
    const { containerElem, container } = createScene()

    const { state: next, effects } = resolveHoverTransition(initialHoverState(), frame({ containerElem, container }))

    expect(effects).toEqual([{ kind: 'enter-container' }])
    expect(next.container).toBe(container)
    expect(next.containerElem).toBe(containerElem)
  })

  it('leaves a container when the pointer moves off all containers', () => {
    const { containerElem, container } = createScene()

    const { effects } = resolveHoverTransition(state({ container, containerElem }), frame({}))

    expect(effects).toEqual([{ kind: 'leave-container' }])
  })

  it('leaves and enters when crossing between containers in one frame', () => {
    const { containerElem, container, otherContainerElem, otherContainer } = createScene()

    const { state: next, effects } = resolveHoverTransition(
      state({ container, containerElem }),
      frame({ containerElem: otherContainerElem, container: otherContainer }),
    )

    expect(effects).toEqual([{ kind: 'leave-container' }, { kind: 'enter-container' }])
    expect(next.container).toBe(otherContainer)
  })

  it('emits no effects while hovering within the same container', () => {
    const { containerElem, container } = createScene()

    const { effects } = resolveHoverTransition(state({ container, containerElem }), frame({ containerElem, container }))

    expect(effects).toEqual([])
  })

  it('tracks a container-shaped element with no registered container without emitting container effects', () => {
    const { containerElem } = createScene()

    const { state: next, effects } = resolveHoverTransition(initialHoverState(), frame({ containerElem }))

    expect(effects).toEqual([])
    expect(next.container).toBeNull()
    expect(next.containerElem).toBe(containerElem)
  })

  it('enters a droppable: enter + resolve-drop with the quadrant position', () => {
    const { containerElem, droppableA, container } = createScene()

    const { state: next, effects } = resolveHoverTransition(
      state({ container, containerElem }),
      frame({ containerElem, container, droppableElem: droppableA, droppableRect: RECT, mouse: { x: 10, y: 10 } }),
    )

    expect(effects).toEqual([
      { kind: 'enter-droppable', droppable: droppableA, position: 'top-left' },
      { kind: 'resolve-drop', droppable: droppableA, position: 'top-left' },
    ])
    expect(next.droppableElem).toBe(droppableA)
    expect(next.droppablePosition).toBe('top-left')
  })

  it('re-resolves without an enter when the quadrant changes on the same droppable', () => {
    const { containerElem, droppableA, container } = createScene()

    const { effects } = resolveHoverTransition(
      state({ container, containerElem, droppableElem: droppableA, droppablePosition: 'top-left' }),
      frame({ containerElem, container, droppableElem: droppableA, droppableRect: RECT, mouse: { x: 90, y: 30 } }),
    )

    expect(effects).toEqual([{ kind: 'resolve-drop', droppable: droppableA, position: 'bottom-right' }])
  })

  it('emits nothing when the droppable and quadrant are unchanged', () => {
    const { containerElem, droppableA, container } = createScene()

    const { effects } = resolveHoverTransition(
      state({ container, containerElem, droppableElem: droppableA, droppablePosition: 'top-left' }),
      frame({ containerElem, container, droppableElem: droppableA, droppableRect: RECT, mouse: { x: 20, y: 5 } }),
    )

    expect(effects).toEqual([])
  })

  it('leaves, enters, and re-resolves when crossing droppables in one frame', () => {
    const { containerElem, droppableA, droppableB, container } = createScene()

    const { effects } = resolveHoverTransition(
      state({ container, containerElem, droppableElem: droppableA, droppablePosition: 'bottom-left' }),
      frame({ containerElem, container, droppableElem: droppableB, droppableRect: RECT, mouse: { x: 10, y: 10 } }),
    )

    expect(effects).toEqual([
      { kind: 'leave-droppable', droppable: droppableA },
      { kind: 'enter-droppable', droppable: droppableB, position: 'top-left' },
      { kind: 'resolve-drop', droppable: droppableB, position: 'top-left' },
    ])
  })

  it('leaves the droppable without an indicator effect when the pointer is over container dead space', () => {
    const { containerElem, droppableA, container } = createScene()

    const { state: next, effects } = resolveHoverTransition(
      state({ container, containerElem, droppableElem: droppableA, droppablePosition: 'top-left' }),
      frame({ containerElem, container }),
    )

    // the indicator keeps its last position — hiding on dead space is the
    // resolve-drop effect's job, and no resolve happens here
    expect(effects).toEqual([{ kind: 'leave-droppable', droppable: droppableA }])
    expect(next.droppableElem).toBeNull()
  })

  it('applies the dead-area rule: a droppable outside the hovered container is no droppable', () => {
    const { containerElem, container, otherDroppable } = createScene()

    const { state: next, effects } = resolveHoverTransition(
      state({ container, containerElem }),
      frame({ containerElem, container, droppableElem: otherDroppable, droppableRect: RECT, mouse: { x: 10, y: 10 } }),
    )

    expect(effects).toEqual([])
    expect(next.droppableElem).toBeNull()
  })

  it('clears the droppable on leave-container so re-entering the same droppable and quadrant re-resolves', () => {
    const { containerElem, droppableA, container } = createScene()

    const { state: left, effects: leaveEffects } = resolveHoverTransition(
      state({ container, containerElem, droppableElem: droppableA, droppablePosition: 'top-left' }),
      frame({}),
    )

    expect(leaveEffects).toEqual([{ kind: 'leave-container' }])
    expect(left).toEqual({ container: null, containerElem: null, droppableElem: null, droppablePosition: null })

    const { effects: reenterEffects } = resolveHoverTransition(
      left,
      frame({ containerElem, container, droppableElem: droppableA, droppableRect: RECT, mouse: { x: 10, y: 10 } }),
    )

    expect(reenterEffects).toEqual([
      { kind: 'enter-container' },
      { kind: 'enter-droppable', droppable: droppableA, position: 'top-left' },
      { kind: 'resolve-drop', droppable: droppableA, position: 'top-left' },
    ])
  })

  it('suppresses droppable callbacks while over an unregistered container but still tracks the hover', () => {
    const { containerElem, droppableA } = createScene()

    const { state: next, effects } = resolveHoverTransition(
      state({ containerElem }),
      frame({ containerElem, droppableElem: droppableA, droppableRect: RECT, mouse: { x: 10, y: 10 } }),
    )

    // no enter-droppable (no container to fire it on) — but resolve-drop
    // still arrives so the caller can clear a stale resolution
    expect(effects).toEqual([{ kind: 'resolve-drop', droppable: droppableA, position: 'top-left' }])
    expect(next.droppableElem).toBe(droppableA)
  })
})
