import { Picker } from 'emoji-mart'
import React, { useEffect, useRef } from 'react'

// the runtime instance is the picker's custom element, which also exposes an
// update() method — emoji-mart ships dist/index.d.ts, but its types are `any`
// throughout, so the instance shape we rely on is declared here
interface EmojiMartInstance extends HTMLElement {
  update: (props: EmojiMartPickerOptions) => void
}

// the options we pass through to emoji-mart's Picker, per
// https://github.com/missive/emoji-mart#options--props — emoji-mart's own
// types are `any` throughout, so these are declared here with no index
// signature: a misspelled option fails typecheck instead of leaking silently
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
    // Use the registered custom element class from the registry instead of
    // the imported Picker class directly. When multiple copies of the bundle
    // are loaded (e.g. UMD + ESM in Inkling's dev environment), only the first
    // copy's class gets registered with customElements.define(). Instantiating
    // an unregistered class throws "Illegal constructor".
    const RegisteredPicker = customElements.get('em-emoji-picker') || Picker
    setInstance(
      new (RegisteredPicker as new (options: Record<string, unknown>) => EmojiMartInstance)({ ...props, ref }),
    )

    return () => {
      setInstance(null)
    }
    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return React.createElement('div', { ref })
}
