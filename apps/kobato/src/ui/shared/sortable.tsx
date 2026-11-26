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
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { GripVerticalIcon } from 'lucide-react'

export const VERTICAL_AXIS_ONLY = [restrictToVerticalAxis]

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

export interface SortableDragHandleProps {
  attributes: Omit<DraggableAttributes, 'aria-describedby'>
  listeners: DraggableSyntheticListeners
}

export interface SortableRowChrome {
  setNodeRef: (element: HTMLElement | null) => void
  style: CSSProperties
  isDragging: boolean
  dragHandleProps: SortableDragHandleProps
}

export function useSortableRow(options: {
  id: UniqueIdentifier
  data?: Record<string, unknown>
  disabled?: boolean
}): SortableRowChrome {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable(options)
  const { 'aria-describedby': _removed, ...dragAttributes } = attributes
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    isDragging,
    dragHandleProps: { attributes: dragAttributes, listeners },
  }
}

export function SortableDragHandle({ attributes, listeners }: SortableDragHandleProps) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
      aria-label={t('admin.shared.filter.dragSort')}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
}

export function sortableIndexOf(value: object): number | undefined {
  const maybe = value as { sortable?: { index?: unknown } } | Record<string, never>
  const index = maybe.sortable?.index
  return typeof index === 'number' ? index : undefined
}
