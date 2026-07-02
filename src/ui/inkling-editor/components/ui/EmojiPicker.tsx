import { Picker } from 'emoji-mart'
import React, { useEffect, useRef } from 'react'

interface EmojiMartInstance {
  update: (props: Record<string, unknown>) => void
}

export default function EmojiPicker({
  setInstanceRef,
  ...props
}: {
  setInstanceRef?: (instance: EmojiMartInstance | null) => void
  [key: string]: unknown
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  const instance = useRef<EmojiMartInstance | null>(null)

  function setInstance(newInstance: EmojiMartInstance | null) {
    instance.current = newInstance
    setInstanceRef?.(newInstance)
  }

  if (instance.current) {
    instance.current.update(props)
  }

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
