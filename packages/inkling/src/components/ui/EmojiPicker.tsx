import { Picker } from 'emoji-mart'
import React, { useEffect, useRef } from 'react'

interface EmojiMartInstance extends HTMLElement {
  update: (props: EmojiMartPickerOptions) => void
}

type EmojiMartPickerConstructor = new (options: Record<string, unknown>) => EmojiMartInstance

function isEmojiMartPickerConstructor(value: unknown): value is EmojiMartPickerConstructor {
  return typeof value === 'function'
}

export type EmojiMartPickerOptions = {
  data: unknown
  onEmojiSelect?: (emoji: { native?: string }) => void
  theme?: 'auto' | 'light' | 'dark'
  autoFocus?: boolean
  dynamicWidth?: boolean
  emojiButtonRadius?: string
  emojiButtonSize?: number
  emojiSize?: number
  icons?: 'auto' | 'outline' | 'solid'
  locale?: string
  maxFrequentRows?: number
  navPosition?: 'top' | 'bottom' | 'none'
  noCountryFlags?: boolean
  noResultsEmoji?: string
  perLine?: number
  previewEmoji?: string | null
  previewPosition?: 'top' | 'bottom' | 'none'
  searchPosition?: 'sticky' | 'static' | 'none'
  set?: 'native' | 'apple' | 'facebook' | 'google' | 'twitter'
  skin?: 1 | 2 | 3 | 4 | 5 | 6
  skinTonePosition?: 'preview' | 'search' | 'none'
}

export default function EmojiPicker({
  setInstanceRef,
  ...props
}: EmojiMartPickerOptions & {
  setInstanceRef?: (instance: EmojiMartInstance | null) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  const instance = useRef<EmojiMartInstance | null>(null)

  function setInstance(newInstance: EmojiMartInstance | null) {
    instance.current = newInstance
    setInstanceRef?.(newInstance)
  }

  useEffect(() => {
    instance.current?.update(props)
  })

  useEffect(() => {
    const pickerCandidate: unknown = customElements.get('em-emoji-picker') || Picker
    if (!isEmojiMartPickerConstructor(pickerCandidate)) {
      throw new TypeError('emoji-mart picker constructor is not available')
    }
    setInstance(new pickerCandidate({ ...props, ref }))

    return () => {
      setInstance(null)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return React.createElement('div', { ref })
}
