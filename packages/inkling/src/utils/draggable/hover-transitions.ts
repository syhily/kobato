import type { DroppablePosition } from '@/utils/draggable/DragDropContainer'

// Hover transitions — the pure state machine behind DragDropHandler's drag
// move, extracted so the handler only interprets effects. One frame in
// (what is under the pointer, resolved to plain data), the next hover state
// plus the ordered effects out; the handler fires container callbacks, the
// indicator, and the drop resolution in exactly that order. Same shape as
// reorder-rules: everything DOM-measured (elementFromPoint, rects) stays at
// the caller's edges, so the transition matrix is a synchronous test table.
//
// The machine is generic over the container type so it never imports the
// registry — the caller resolves "which registered container owns this
// element" into the frame.

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

// one drag-move frame: the pointer's hit resolved to plain data. container
// is the registered container for containerElem (null when the element is a
// container-shaped element no registered container owns — the machine then
// tracks the hover but emits no container effects, matching the handler's
// historical gating)
export interface HoverFrame<C> {
  containerElem: Element | null
  container: C | null
  // the raw droppable hit; the dead-area rule (a droppable not contained by
  // the hovered container is no droppable — e.g. the pointer is over the
  // drop indicator) applies inside the machine
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

// the ordered intents the caller interprets. leave-container carries the
// indicator hide + resolution clear; resolve-drop carries the
// over-callback, the getIndicatorPosition call, and the indicator
// show/hide with the resolution write
export type HoverEffect =
  | { kind: 'leave-container' }
  | { kind: 'enter-container' }
  | { kind: 'leave-droppable'; droppable: HTMLElement }
  | { kind: 'enter-droppable'; droppable: HTMLElement; position: DroppablePosition }
  | { kind: 'resolve-drop'; droppable: HTMLElement; position: DroppablePosition }

export function initialHoverState<C>(): HoverState<C> {
  return { container: null, containerElem: null, droppableElem: null, droppablePosition: null }
}

// top/bottom from the pointer's half of the droppable's height, left/right
// from its half of the width
export function resolveDroppablePosition(rect: HoverRect, mouse: HoverPoint): DroppablePosition {
  const inTop = mouse.y < rect.y + rect.height / 2
  const inLeft = mouse.x < rect.x + rect.width / 2
  return `${inTop ? 'top' : 'bottom'}-${inLeft ? 'left' : 'right'}`
}

export function resolveHoverTransition<C>(
  prev: HoverState<C>,
  frame: HoverFrame<C>,
): { state: HoverState<C>; effects: HoverEffect[] } {
  // the dead-area rule: a droppable the hovered container does not contain
  // (the drop indicator sits between droppables) is no droppable
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
    // drop the droppable too: re-entering the same droppable in the same
    // quadrant must re-fire enter-droppable + resolve-drop, otherwise the
    // stale identity/position match swallows the resolution
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
