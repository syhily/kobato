import type { DroppablePosition } from '@/inkling/utils/draggable/DragDropContainer'

// The pure hover state machine behind DragDropHandler's drag move: one frame in (what is
// under the pointer, resolved to plain data), the next hover state plus the ordered effects
// out. Everything DOM-measured stays at the caller's edges; the machine is generic over the
// container type so it never imports the registry.

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

// One drag-move frame: the pointer's hit resolved to plain data. `container` is the
// registered container for `containerElem` (null when the element is container-shaped but no
// registered container owns it — the machine tracks the hover but emits no container
// effects).
export interface HoverFrame<C> {
  containerElem: Element | null
  container: C | null
  // filtered by the dead-area rule inside the machine (see resolveHoverTransition)
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

// The ordered intents the caller interprets; leave-container carries the indicator hide and
// resolution clear, resolve-drop the over-callback, the getIndicatorPosition call, and the
// indicator show/hide with the resolution write.
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
  // Dead-area rule: a droppable the hovered container does not contain (the drop indicator
  // sits between droppables) is no droppable.
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
    // Re-entering the same droppable in the same quadrant must re-fire enter-droppable +
    // resolve-drop; a stale identity/position match would swallow the resolution.
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
