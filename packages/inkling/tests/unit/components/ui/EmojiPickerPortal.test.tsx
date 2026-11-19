import EmojiPickerPortal from '@kobato/inkling-internal/components/ui/EmojiPickerPortal'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pickerPropsSpy = vi.hoisted(() => vi.fn())

vi.mock('@kobato/inkling-internal/components/ui/EmojiPicker', () => ({
  default: (props: Record<string, unknown>) => {
    pickerPropsSpy(props)
    return <div data-testid="emoji-picker" />
  },
}))

function createAnchor(rect: { top: number; left: number }): React.RefObject<HTMLElement | null> {
  const anchor = document.createElement('div')
  document.body.appendChild(anchor)
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    top: rect.top,
    left: rect.left,
    right: rect.left + 20,
    bottom: rect.top + 20,
    width: 20,
    height: 20,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  })
  return { current: anchor }
}

describe('EmojiPickerPortal', () => {
  afterEach(() => {
    document.documentElement.scrollTop = 0
    document.documentElement.scrollLeft = 0
  })

  it('positions the picker at the anchor’s viewport coordinates regardless of scroll', () => {
    document.documentElement.scrollTop = 200
    document.documentElement.scrollLeft = 100
    const positionRef = createAnchor({ top: 300, left: 400 })

    render(<EmojiPickerPortal onEmojiClick={() => {}} positionRef={positionRef} />)

    const container = screen.getByTestId('emoji-picker-container')
    expect(container.style.position).toBe('fixed')
    expect(container.style.left).toBe('400px')
    expect(container.style.top).toBe('300px')
  })

  it('flips the picker above the anchor when it would overflow the viewport bottom', () => {
    const positionRef = createAnchor({ top: 700, left: 50 })

    render(<EmojiPickerPortal onEmojiClick={() => {}} positionRef={positionRef} />)

    const container = screen.getByTestId('emoji-picker-container')
    expect(container.style.top).toBe('313px')
    expect(container.style.left).toBe('50px')
  })

  it('does not forward unknown props to the picker', () => {
    const positionRef = createAnchor({ top: 300, left: 400 })

    render(
      <EmojiPickerPortal
        onEmojiClick={() => {}}
        positionRef={positionRef}
        // @ts-expect-error - unknown props are rejected by the tightened props type
        togglePortal={() => {}}
      />,
    )

    expect(pickerPropsSpy).toHaveBeenCalled()
    expect(pickerPropsSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty('togglePortal')
  })
})
