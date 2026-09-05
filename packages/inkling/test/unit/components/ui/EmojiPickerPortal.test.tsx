import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EmojiPickerPortal from '@/components/ui/EmojiPickerPortal'

const pickerPropsSpy = vi.hoisted(() => vi.fn())

vi.mock('@/components/ui/EmojiPicker', () => ({
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
    // fixed positioning uses viewport coordinates; scroll offsets must not be added
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
    // windowHeight (viewport) is jsdom’s default 768; 700 + 352 exceeds it
    const positionRef = createAnchor({ top: 700, left: 50 })

    render(<EmojiPickerPortal onEmojiClick={() => {}} positionRef={positionRef} />)

    const container = screen.getByTestId('emoji-picker-container')
    // rect.top - pickerHeight (352) - shiftPixels (35)
    expect(container.style.top).toBe('313px')
    expect(container.style.left).toBe('50px')
  })

  it('does not forward unknown props to the picker', () => {
    // before the props were tightened, an unknown prop (e.g. CalloutCard's dead
    // `togglePortal`) leaked through the index signature all the way to emoji-mart
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
