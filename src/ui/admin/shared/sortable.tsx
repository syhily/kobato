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

// Shared chrome for the admin's @dnd-kit sortable lists: sensors, drag-end
// plumbing, and row scaffolding — lists keep their own row contents and
// container styling.

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

/** Resolve a drag-end into a list move; null for a no-op drop (outside a row, onto itself, or a foreign row). */
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

/** dnd-kit attributes (with `aria-describedby` stripped) plus synthetic listeners, kept as two fields so the handle spreads them separately. */
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
 * Per-row `useSortable` plumbing shared by every admin sortable list.
 * Destructure the result — member access trips the react-compiler ref heuristic.
 */
export function useSortableRow(options: {
  id: UniqueIdentifier
  data?: Record<string, unknown>
  /** Forwarded to `useSortable` — a disabled row stays put and ignores drags. */
  disabled?: boolean
}): SortableRowChrome {
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

/** `useSortable` augments draggable `.data` with `sortable.index` at runtime — read it without narrowing the whole object. */
export function sortableIndexOf(value: object): number | undefined {
  const maybe = value as { sortable?: { index?: unknown } } | Record<string, never>
  const index = maybe.sortable?.index
  return typeof index === 'number' ? index : undefined
}
