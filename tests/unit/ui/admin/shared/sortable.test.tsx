// @vitest-environment happy-dom

import { DndContext } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { resolveSortableMove, SortableDragHandle, sortableIndexOf, useSortableRow } from '@/ui/admin/shared/sortable'

describe('resolveSortableMove', () => {
  const rows = [{ clientId: 'a' }, { clientId: 'b' }, { clientId: 'c' }]
  const getId = (row: { clientId: string }) => row.clientId

  it('resolves a downward move by client id', () => {
    expect(resolveSortableMove('a', 'c', rows, getId)).toEqual({ from: 0, to: 2 })
  })

  it('resolves an upward move by client id', () => {
    expect(resolveSortableMove('c', 'a', rows, getId)).toEqual({ from: 2, to: 0 })
  })

  it('returns null when the drag ends outside any row', () => {
    expect(resolveSortableMove('a', undefined, rows, getId)).toBeNull()
  })

  it('returns null when the row is dropped onto itself', () => {
    expect(resolveSortableMove('b', 'b', rows, getId)).toBeNull()
  })

  it('returns null when the dragged id is not a row of the list', () => {
    expect(resolveSortableMove('missing', 'b', rows, getId)).toBeNull()
  })

  it('returns null when the drop target is not a row of the list', () => {
    expect(resolveSortableMove('a', 'missing', rows, getId)).toBeNull()
  })
})

describe('sortableIndexOf', () => {
  it('reads the runtime sortable.index field', () => {
    expect(sortableIndexOf({ sortable: { index: 3 } })).toBe(3)
  })

  it('returns undefined when the field is absent or not a number', () => {
    expect(sortableIndexOf({})).toBeUndefined()
    expect(sortableIndexOf({ sortable: {} })).toBeUndefined()
    expect(sortableIndexOf({ sortable: { index: '3' } })).toBeUndefined()
  })
})

function ProbeRow({ id }: { id: string }) {
  const { setNodeRef, style, dragHandleProps } = useSortableRow({ id })
  return (
    <div ref={setNodeRef} style={style}>
      <SortableDragHandle {...dragHandleProps} />
    </div>
  )
}

describe('sortable row chrome', () => {
  it('renders the grip handle with the described-by strip applied', () => {
    render(
      <DndContext>
        <SortableContext items={['a', 'b']} strategy={verticalListSortingStrategy}>
          <ProbeRow id="a" />
          <ProbeRow id="b" />
        </SortableContext>
      </DndContext>,
    )
    const handles = screen.getAllByRole('button', { name: '拖拽排序' })
    expect(handles).toHaveLength(2)
    for (const handle of handles) {
      expect(handle).not.toHaveAttribute('aria-describedby')
      expect(handle).toHaveAttribute('aria-roledescription', 'sortable')
    }
  })
})
