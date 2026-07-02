import kebabCase from 'lodash/kebabCase'

// we use data attributes rather than classes even though they can be slower
// because in many instances our draggable/droppable element's classes attribute
// could be dynamically generated which could remove our DnD classes when changed

export const CONTAINER_DATA_ATTR = 'inklingDndContainer'
export const CONTAINER_SELECTOR = `[data-${kebabCase(CONTAINER_DATA_ATTR)}]`

export const DRAGGABLE_DATA_ATTR = 'inklingDndDraggable'
export const DRAGGABLE_SELECTOR = `[data-${kebabCase(DRAGGABLE_DATA_ATTR)}]`

export const DROPPABLE_DATA_ATTR = 'inklingDndDroppable'
export const DROPPABLE_SELECTOR = `[data-${kebabCase(DROPPABLE_DATA_ATTR)}]`

export const DRAG_DISABLED_DATA_ATTR = 'inklingDndDisabled'
export const DRAG_DISABLED_SELECTOR = `[data-${kebabCase(DRAG_DISABLED_DATA_ATTR)}]`

export const DROP_INDICATOR_ID = 'inkling-drag-drop-indicator'
export const DROP_INDICATOR_ZINDEX = 10000

export const INKLING_CONTAINER_ID = 'inkling-drag-drop-container'

export const INKLING_ZINDEX = DROP_INDICATOR_ZINDEX + 1
