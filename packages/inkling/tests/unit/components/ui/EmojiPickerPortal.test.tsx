import type { EmojiLocale } from '@kobato/inkling-internal/plugins/behaviour/emoji-search-index'

import EmojiPickerPortal from '@kobato/inkling-internal/components/ui/EmojiPickerPortal'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { DEFAULT_LABELS } from '@kobato/inkling-internal/labels/inkling-labels'
import { render, screen } from '@testing-library/react'
import { type RefObject, type ReactNode, useMemo } from 'react'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const pickerPropsSpy = vi.hoisted(() => vi.fn())

const ink_components_ui_EmojiPicker = await import('@kobato/inkling-internal/components/ui/EmojiPicker')
vi.spyOn(ink_components_ui_EmojiPicker, 'default').mockImplementation(((props: Record<string, unknown>) => {
  pickerPropsSpy(props)
  return <div data-testid="emoji-picker" />
}) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

function createAnchor(rect: { top: number; left: number }): RefObject<HTMLElement | null> {
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

  it('hands the adapter a dataset loader for the context locale and none without one', () => {
    function ComposerPrefs({ emojiLocale, children }: { emojiLocale: EmojiLocale; children: ReactNode }) {
      const value = useMemo(() => ({ darkMode: false, labels: DEFAULT_LABELS, emojiLocale }), [emojiLocale])
      return <InklingUiPrefsContext.Provider value={value}>{children}</InklingUiPrefsContext.Provider>
    }
    const renderPortal = (emojiLocale?: EmojiLocale) => {
      const positionRef = createAnchor({ top: 300, left: 400 })
      render(
        emojiLocale === undefined ? (
          <EmojiPickerPortal onEmojiClick={() => {}} positionRef={positionRef} />
        ) : (
          <ComposerPrefs emojiLocale={emojiLocale}>
            <EmojiPickerPortal onEmojiClick={() => {}} positionRef={positionRef} />
          </ComposerPrefs>
        ),
      )
    }

    renderPortal('zh')
    expect(typeof pickerPropsSpy.mock.calls.at(-1)?.[0].emojiData).toBe('function')

    renderPortal()
    expect(pickerPropsSpy.mock.calls.at(-1)?.[0].emojiData).toBeUndefined()
  })
})
