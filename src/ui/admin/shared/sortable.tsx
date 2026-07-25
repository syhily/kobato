import type { CSSProperties } from 'react'

import {
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'

// Shared chrome for the admin's @dnd-kit sortable lists (navigation editors,
// font slot columns). Owns the pieces that used to be hand-copied per list —
// the sensor set, the find-by-id + move drag-end plumbing, and the row
// scaffolding (`useSortable` + grip handle + transform style) — while each
// list keeps its own row contents and container styling.

/** Pointer + keyboard sensors; every admin sortable list uses this exact set. */
export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

export interface SortableMove {
  from: number
  to: number
}

/**
 * Resolve a drag-end into a list move: find both ids by key and return the
 * indices to feed `useFieldArray().move` (or an equivalent reorder). Returns
 * null for a no-op drop — outside any row, onto itself, or onto an element
 * that is not a row of this list.
 */
export function resolveSortableMove<T>(
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier | undefined,
  items: readonly T[],
  getId: (item: T) => UniqueIdentifier,
): SortableMove | null {
  if (overId === undefined || activeId === overId) {
    return null
  }
  const from = items.findIndex((item) => getId(item) === activeId)
  const to = items.findIndex((item) => getId(item) === overId)
  if (from < 0 || to < 0) {
    return null
  }
  return { from, to }
}

/**
 * Props for `<SortableDragHandle>`: the dnd-kit attributes (with
 * `aria-describedby` stripped, as in the lists this module was extracted
 * from) plus the synthetic listeners. Kept as two fields because
 * `SyntheticListenerMap`'s index signature cannot intersect with the
 * attribute props — the handle spreads them onto the button separately,
 * exactly as the per-list copies did.
 */
export interface SortableDragHandleProps {
  attributes: Omit<DraggableAttributes, 'aria-describedby'>
  listeners: DraggableSyntheticListeners
}

export interface SortableRowChrome {
  /** Ref for the row element dnd-kit measures and transforms. */
  setNodeRef: (element: HTMLElement | null) => void
  /** Transform + transition style for the row element. */
  style: CSSProperties
  isDragging: boolean
  /** Spread onto `<SortableDragHandle>`. */
  dragHandleProps: SortableDragHandleProps
}

/**
 * The per-row `useSortable` plumbing shared by every admin sortable list.
 * Row contents and container styling stay at the call site; the dragging
 * visual is up to the list (inline opacity or a class toggle) via
 * `isDragging`. Destructure the result — member access on the returned
 * object trips the react-compiler ref heuristic (`row.setNodeRef` reads as
 * a ref access during render).
 */
export function useSortableRow(options: { id: UniqueIdentifier; data?: Record<string, unknown> }): SortableRowChrome {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable(options)
  const { 'aria-describedby': _removed, ...dragAttributes } = attributes
  void _removed
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    isDragging,
    dragHandleProps: { attributes: dragAttributes, listeners },
  }
}

/** The grip button every sortable row leads with. */
export function SortableDragHandle({ attributes, listeners }: SortableDragHandleProps) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
      aria-label="拖拽排序"
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
}

/**
 * `useSortable` augments the draggable's `.data` with a `sortable.index`
 * field at runtime. Read it without narrowing the whole object — a caller
 * resolving a drop target only needs the number.
 */
export function sortableIndexOf(value: object): number | undefined {
  const maybe = value as { sortable?: { index?: unknown } } | Record<string, never>
  const index = maybe.sortable?.index
  return typeof index === 'number' ? index : undefined
}
