import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useCardMenuSession, type CardMenuSessionSelection } from '@/hooks/useCardMenuSession'

function createFakeSelection() {
  const ranges: Range[] = []
  const selection: CardMenuSessionSelection = {
    removeAllRanges: vi.fn(() => {
      ranges.length = 0
    }),
    addRange: vi.fn((range: Range) => {
      ranges.push(range)
    }),
  }
  return { ranges, selection }
}

function Harness({ getSelection }: { getSelection: () => CardMenuSessionSelection | null }) {
  const session = useCardMenuSession({ getSelection })
  const anchorRange = React.useMemo(() => document.createRange(), [])
  return (
    <div>
      <output data-testid="is-open">{String(session.isOpen)}</output>
      <button type="button" data-testid="open" onClick={() => session.openMenu()} />
      <button type="button" data-testid="open-anchor" onClick={() => session.openMenu({ anchor: anchorRange })} />
      <button type="button" data-testid="close" onClick={() => session.closeMenu()} />
      <button type="button" data-testid="close-reset" onClick={() => session.closeMenu({ resetCursor: true })} />
      <button type="button" data-testid="save" onClick={() => session.saveCursor(document.createRange())} />
      <button type="button" data-testid="insert" onClick={() => session.insert(() => {})} />
      <div ref={session.containerRef} data-testid="menu" />
    </div>
  )
}

function setup() {
  const fake = createFakeSelection()
  render(<Harness getSelection={() => fake.selection} />)
  return fake
}

function isOpen(): boolean {
  return screen.getByTestId('is-open').textContent === 'true'
}

function click(testId: string) {
  act(() => {
    screen.getByTestId(testId).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function keydown(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
  })
}

describe('useCardMenuSession', () => {
  it('opens and closes the menu', () => {
    setup()
    expect(isOpen()).toBe(false)

    click('open')
    expect(isOpen()).toBe(true)

    click('close')
    expect(isOpen()).toBe(false)
  })

  it('opening with an anchor leases it and restores the caret onto it', () => {
    const fake = setup()
    click('open-anchor')

    expect(isOpen()).toBe(true)
    expect(fake.selection.removeAllRanges).toHaveBeenCalledTimes(1)
    expect(fake.ranges).toHaveLength(1)

    // the anchor is the lease: a resetCursor close restores it again
    click('close-reset')
    expect(fake.selection.removeAllRanges).toHaveBeenCalledTimes(2)
    expect(fake.ranges).toHaveLength(1)
  })

  it('opening without an anchor leaves the selection alone', () => {
    const fake = setup()
    click('open')

    expect(isOpen()).toBe(true)
    expect(fake.selection.removeAllRanges).not.toHaveBeenCalled()
  })

  it('restores the leased cursor range when closing with resetCursor', () => {
    const fake = setup()
    click('save')
    click('open')
    click('close-reset')

    expect(fake.selection.removeAllRanges).toHaveBeenCalledTimes(1)
    expect(fake.ranges).toHaveLength(1)
  })

  it('leaves the cursor alone on a plain close', () => {
    const fake = setup()
    click('save')
    click('open')
    click('close')

    expect(fake.selection.removeAllRanges).not.toHaveBeenCalled()
  })

  it('releases the lease on close — a later resetCursor close has nothing to restore', () => {
    const fake = setup()
    click('save')
    click('open')
    click('close-reset')
    click('open')
    click('close-reset')

    expect(fake.selection.addRange).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and restores the cursor', () => {
    const fake = setup()
    click('save')
    click('open')
    keydown('Escape')

    expect(isOpen()).toBe(false)
    expect(fake.selection.addRange).toHaveBeenCalledTimes(1)
  })

  it('closes on an outside mousedown without restoring the cursor', () => {
    const fake = setup()
    click('save')
    click('open')

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(isOpen()).toBe(false)
    expect(fake.selection.addRange).not.toHaveBeenCalled()
  })

  it('ignores a mousedown inside the menu container', () => {
    setup()
    click('open')

    act(() => {
      screen.getByTestId('menu').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(isOpen()).toBe(true)
  })

  it('inserts and then closes', () => {
    setup()
    click('open')
    click('insert')

    expect(isOpen()).toBe(false)
  })

  it('ignores Escape and outside mousedown while closed', () => {
    const fake = setup()
    keydown('Escape')

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(isOpen()).toBe(false)
    expect(fake.selection.addRange).not.toHaveBeenCalled()
  })
})
