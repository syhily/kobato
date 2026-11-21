import type { DroppablePosition } from '@kobato/inkling-internal/utils/draggable/DragDropContainer'

export interface HoverPoint {
  x: number
  y: number
}

export interface HoverRect {
  x: number
  y: number
  width: number
  height: number
}

export interface HoverFrame<C> {
  containerElem: Element | null
  container: C | null
  droppableElem: HTMLElement | null
  droppableRect: HoverRect | null
  mouse: HoverPoint
}

export interface HoverState<C> {
  container: C | null
  containerElem: Element | null
  droppableElem: HTMLElement | null
  droppablePosition: DroppablePosition | null
}

export type HoverEffect =
  | { kind: 'leave-container' }
  | { kind: 'enter-container' }
  | { kind: 'leave-droppable'; droppable: HTMLElement }
  | { kind: 'enter-droppable'; droppable: HTMLElement; position: DroppablePosition }
  | { kind: 'resolve-drop'; droppable: HTMLElement; position: DroppablePosition }

export function initialHoverState<C>(): HoverState<C> {
  return { container: null, containerElem: null, droppableElem: null, droppablePosition: null }
}

export function resolveDroppablePosition(rect: HoverRect, mouse: HoverPoint): DroppablePosition {
  const inTop = mouse.y < rect.y + rect.height / 2
  const inLeft = mouse.x < rect.x + rect.width / 2
  return `${inTop ? 'top' : 'bottom'}-${inLeft ? 'left' : 'right'}`
}

export function resolveHoverTransition<C>(
  prev: HoverState<C>,
  frame: HoverFrame<C>,
): { state: HoverState<C>; effects: HoverEffect[] } {
  const droppableElem =
    frame.containerElem && frame.droppableElem && frame.containerElem.contains(frame.droppableElem)
      ? frame.droppableElem
      : null

  const isLeavingContainer = prev.containerElem !== null && frame.containerElem !== prev.containerElem
  const isLeavingDroppable = prev.droppableElem !== null && droppableElem !== prev.droppableElem
  const isOverContainer = frame.containerElem !== null && frame.containerElem !== prev.containerElem

  const state: HoverState<C> = { ...prev }
  const effects: HoverEffect[] = []

  if (isLeavingContainer && prev.container) {
    effects.push({ kind: 'leave-container' })
    state.container = null
    state.containerElem = null
    state.droppableElem = null
    state.droppablePosition = null
  }

  if (isOverContainer) {
    if (!state.container && frame.container) {
      effects.push({ kind: 'enter-container' })
    }
    state.container = frame.container
    state.containerElem = frame.containerElem
  }

  if (isLeavingDroppable && state.container && prev.droppableElem) {
    effects.push({ kind: 'leave-droppable', droppable: prev.droppableElem })
    state.droppableElem = null
  }

  if (droppableElem && frame.droppableRect) {
    const position = resolveDroppablePosition(frame.droppableRect, frame.mouse)

    if (!state.droppableElem && state.container) {
      effects.push({ kind: 'enter-droppable', droppable: droppableElem, position })
    }

    if (droppableElem !== state.droppableElem || position !== state.droppablePosition) {
      state.droppableElem = droppableElem
      state.droppablePosition = position
      effects.push({ kind: 'resolve-drop', droppable: droppableElem, position })
    }
  }

  return { state, effects }
}
