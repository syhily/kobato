import type { LexicalEditor } from 'lexical'

import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SlashMenuVerdict } from '@/plugins/behaviour/card-menu-trigger'

import { useCardMenuSession, type CardMenuSessionSelection } from '@/hooks/useCardMenuSession'
import { useSlashCardMenuTrigger } from '@/hooks/useSlashCardMenuTrigger'
import { registerSlashCardMenuTrigger } from '@/plugins/behaviour/card-menu-trigger'

vi.mock('@/plugins/behaviour/card-menu-trigger', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/plugins/behaviour/card-menu-trigger')>()
  return { ...original, registerSlashCardMenuTrigger: vi.fn(() => () => {}) }
})

// the binding is the adapter between the trigger module and the session — the
// trigger registration is mocked, so verdicts are fed synchronously and the
// query/close matrix runs without an editor
const editor = {} as LexicalEditor

function emitVerdict(verdict: SlashMenuVerdict) {
  const handlers = vi.mocked(registerSlashCardMenuTrigger).mock.calls.at(-1)?.[1]
  if (!handlers) {
    throw new Error('slash trigger not registered')
  }
  act(() => {
    handlers.onVerdict(verdict)
  })
}

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

function Harness({
  getSelection,
  enabled = true,
}: {
  getSelection: () => CardMenuSessionSelection
  enabled?: boolean
}) {
  const session = useCardMenuSession({ getSelection })
  const { query, commandParams } = useSlashCardMenuTrigger(editor, session, enabled)
  return (
    <div>
      <output data-testid="is-open">{String(session.isOpen)}</output>
      <output data-testid="query">{query}</output>
      <output data-testid="params">{commandParams.join(',')}</output>
      <button type="button" data-testid="open" onClick={() => session.openMenu()} />
      <div ref={session.containerRef} data-testid="menu" />
    </div>
  )
}

function setup({ enabled = true }: { enabled?: boolean } = {}) {
  const fake = createFakeSelection()
  render(<Harness enabled={enabled} getSelection={() => fake.selection} />)
  return fake
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

function query(): string {
  return screen.getByTestId('query').textContent ?? ''
}

function commandParams(): string {
  return screen.getByTestId('params').textContent ?? ''
}

function isOpen(): boolean {
  return screen.getByTestId('is-open').textContent === 'true'
}

describe('useSlashCardMenuTrigger', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(registerSlashCardMenuTrigger).mockClear()
  })

  it('registers the trigger only when enabled', () => {
    setup({ enabled: false })
    expect(registerSlashCardMenuTrigger).not.toHaveBeenCalled()

    setup()
    expect(registerSlashCardMenuTrigger).toHaveBeenCalledTimes(1)
  })

  it('tracks the query and command params from a query verdict', () => {
    setup()
    click('open')

    emitVerdict({ type: 'query', query: 'image', commandParams: ['Nature'], cursorRange: null })

    expect(query()).toBe('image')
    expect(commandParams()).toBe('Nature')
  })

  it('leases the verdict cursor range into the session — Escape restores it', () => {
    const fake = setup()
    click('open')

    const cursorRange = document.createRange()
    emitVerdict({ type: 'query', query: 'image', commandParams: [], cursorRange })

    keydown('Escape')

    expect(isOpen()).toBe(false)
    expect(fake.ranges).toEqual([cursorRange])
  })

  it('runs the close policy and resets the state on a close verdict', () => {
    setup()
    click('open')
    emitVerdict({ type: 'query', query: 'image', commandParams: ['Nature'], cursorRange: null })

    emitVerdict({ type: 'close' })

    expect(isOpen()).toBe(false)
    expect(query()).toBe('')
    expect(commandParams()).toBe('')
  })

  it('resets the state on session-owned close paths (Escape, outside mousedown)', () => {
    setup()
    click('open')
    emitVerdict({ type: 'query', query: 'image', commandParams: [], cursorRange: null })

    keydown('Escape')
    expect(query()).toBe('')

    click('open')
    emitVerdict({ type: 'query', query: 'html', commandParams: [], cursorRange: null })
    expect(query()).toBe('html')

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(isOpen()).toBe(false)
    expect(query()).toBe('')
  })
})
