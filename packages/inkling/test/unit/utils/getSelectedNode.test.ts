import type { RangeSelection } from 'lexical'

import { $isAtNodeEnd } from '@lexical/selection'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSelectedNode } from '@/utils/getSelectedNode'

vi.mock('@lexical/selection', () => ({
  $isAtNodeEnd: vi.fn(),
}))

describe('getSelectedNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the anchor node when anchor and focus are the same', () => {
    const node = { key: 'node' }
    const selection = {
      anchor: { getNode: () => node },
      focus: { getNode: () => node },
      isBackward: () => false,
    } as unknown as RangeSelection

    expect(getSelectedNode(selection)).toBe(node)
  })

  it('returns the anchor node when moving backward and focus is at the end', () => {
    const anchorNode = { key: 'anchor' }
    const focusNode = { key: 'focus' }
    const selection = {
      anchor: { getNode: () => anchorNode },
      focus: { getNode: () => focusNode },
      isBackward: () => true,
    } as unknown as RangeSelection

    ;($isAtNodeEnd as ReturnType<typeof vi.fn>).mockReturnValue(true)

    expect(getSelectedNode(selection)).toBe(anchorNode)
  })

  it('returns the focus node when moving backward and focus is not at the end', () => {
    const anchorNode = { key: 'anchor' }
    const focusNode = { key: 'focus' }
    const selection = {
      anchor: { getNode: () => anchorNode },
      focus: { getNode: () => focusNode },
      isBackward: () => true,
    } as unknown as RangeSelection

    ;($isAtNodeEnd as ReturnType<typeof vi.fn>).mockReturnValue(false)

    expect(getSelectedNode(selection)).toBe(focusNode)
  })

  it('returns the focus node when moving forward and anchor is at the end', () => {
    const anchorNode = { key: 'anchor' }
    const focusNode = { key: 'focus' }
    const selection = {
      anchor: { getNode: () => anchorNode },
      focus: { getNode: () => focusNode },
      isBackward: () => false,
    } as unknown as RangeSelection

    ;($isAtNodeEnd as ReturnType<typeof vi.fn>).mockReturnValue(true)

    expect(getSelectedNode(selection)).toBe(focusNode)
  })

  it('returns the anchor node when moving forward and anchor is not at the end', () => {
    const anchorNode = { key: 'anchor' }
    const focusNode = { key: 'focus' }
    const selection = {
      anchor: { getNode: () => anchorNode },
      focus: { getNode: () => focusNode },
      isBackward: () => false,
    } as unknown as RangeSelection

    ;($isAtNodeEnd as ReturnType<typeof vi.fn>).mockReturnValue(false)

    expect(getSelectedNode(selection)).toBe(anchorNode)
  })
})
