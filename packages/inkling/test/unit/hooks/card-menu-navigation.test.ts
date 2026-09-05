import { describe, expect, it, vi } from 'vitest'

import { createMenuNavigator } from '@/hooks/card-menu-navigation'

// The slash menu's keyboard-selection matrix as a synchronous table — the
// state machine behind SlashCardMenuPlugin's command registrations. The
// plugin-level wiring (arrow keys move the rendered selection, query changes
// reset it) is pinned in test/unit/plugins/SlashCardMenuPlugin.test.tsx.

describe('createMenuNavigator', () => {
  it('starts on the first item with no scroll request', () => {
    const menuNavigator = createMenuNavigator()
    expect(menuNavigator.getSnapshot()).toEqual({ selectedItemIndex: 0, scrollToSelectedItem: false })
  })

  it('moveDown steps forward one item and latches a scroll request', () => {
    const menuNavigator = createMenuNavigator()
    menuNavigator.moveDown(3)
    expect(menuNavigator.getSnapshot()).toEqual({ selectedItemIndex: 1, scrollToSelectedItem: true })
  })

  it('moveDown wraps to the first item from the last', () => {
    const menuNavigator = createMenuNavigator()
    menuNavigator.moveDown(2)
    menuNavigator.moveDown(2)
    expect(menuNavigator.getSnapshot().selectedItemIndex).toBe(2)
    menuNavigator.moveDown(2)
    expect(menuNavigator.getSnapshot().selectedItemIndex).toBe(0)
  })

  it('moveUp wraps to the last item from the first', () => {
    const menuNavigator = createMenuNavigator()
    menuNavigator.moveUp(4)
    expect(menuNavigator.getSnapshot().selectedItemIndex).toBe(4)
  })

  it('moveUp steps back one item', () => {
    const menuNavigator = createMenuNavigator()
    menuNavigator.moveDown(4)
    menuNavigator.moveDown(4)
    menuNavigator.moveUp(4)
    expect(menuNavigator.getSnapshot().selectedItemIndex).toBe(1)
  })

  it('stays on the only item of a single-item menu for both directions', () => {
    const menuNavigator = createMenuNavigator()
    menuNavigator.moveDown(0)
    expect(menuNavigator.getSnapshot().selectedItemIndex).toBe(0)
    menuNavigator.moveUp(0)
    expect(menuNavigator.getSnapshot().selectedItemIndex).toBe(0)
  })

  it('keeps the selection on index 0 on an empty menu (maxItemIndex -1)', () => {
    // an empty menu has no selectable item: both directions are no-ops instead
    // of letting the index transiently leave the list (-1 from moveUp, 1 from
    // moveDown), and Enter resolution still finds no item
    const menuNavigator = createMenuNavigator()
    menuNavigator.moveDown(-1)
    expect(menuNavigator.getSnapshot()).toEqual({ selectedItemIndex: 0, scrollToSelectedItem: false })
    expect(menuNavigator.selectedItem([])).toBeUndefined()
    menuNavigator.moveUp(-1)
    expect(menuNavigator.getSnapshot()).toEqual({ selectedItemIndex: 0, scrollToSelectedItem: false })
  })

  it('notifies subscribers on a move until unsubscribed', () => {
    const menuNavigator = createMenuNavigator()
    const listener = vi.fn()
    const unsubscribe = menuNavigator.subscribe(listener)

    menuNavigator.moveDown(3)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    menuNavigator.moveDown(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the snapshot object stable between notifies', () => {
    const menuNavigator = createMenuNavigator()
    const before = menuNavigator.getSnapshot()
    expect(menuNavigator.getSnapshot()).toBe(before)
    menuNavigator.moveDown(3)
    expect(menuNavigator.getSnapshot()).not.toBe(before)
  })

  it('reset returns the selection to the first item and keeps the scroll latch', () => {
    const menuNavigator = createMenuNavigator()
    menuNavigator.moveDown(3)
    menuNavigator.moveDown(3)

    menuNavigator.reset()

    expect(menuNavigator.getSnapshot()).toEqual({ selectedItemIndex: 0, scrollToSelectedItem: true })
  })

  it('reset does not notify when already on the first item', () => {
    const menuNavigator = createMenuNavigator()
    const listener = vi.fn()
    menuNavigator.subscribe(listener)

    menuNavigator.reset()

    expect(listener).not.toHaveBeenCalled()
    expect(menuNavigator.getSnapshot().selectedItemIndex).toBe(0)
  })

  it('consumeScrollRequest reports and clears the latch', () => {
    const menuNavigator = createMenuNavigator()
    expect(menuNavigator.consumeScrollRequest()).toBe(false)

    menuNavigator.moveDown(3)
    expect(menuNavigator.consumeScrollRequest()).toBe(true)
    expect(menuNavigator.getSnapshot().scrollToSelectedItem).toBe(false)
    expect(menuNavigator.consumeScrollRequest()).toBe(false)
  })

  it('selectedItem resolves the item at the current index', () => {
    const menuNavigator = createMenuNavigator()
    const items = ['a', 'b', 'c']
    expect(menuNavigator.selectedItem(items)).toBe('a')

    menuNavigator.moveDown(2)
    expect(menuNavigator.selectedItem(items)).toBe('b')

    // a reset-on-rebuild points Enter back at the first item of the new list
    menuNavigator.reset()
    expect(menuNavigator.selectedItem(['x', 'y'])).toBe('x')
  })

  it('selectedItem returns undefined when the index is out of range', () => {
    const menuNavigator = createMenuNavigator()
    expect(menuNavigator.selectedItem([])).toBeUndefined()
  })
})
