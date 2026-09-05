import defaultData from '@emoji-mart/data'
import React from 'react'

import Picker, { type EmojiMartPickerOptions } from '@/components/ui/EmojiPicker'
import Portal from '@/components/ui/Portal'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'

interface EmojiPickerPortalProps extends Omit<EmojiMartPickerOptions, 'data' | 'onEmojiSelect'> {
  // emoji-mart's onEmojiSelect delivers its (untyped upstream) emoji object;
  // consumers read the `native` character off it
  onEmojiClick: (emoji: { native?: string }) => void
  positionRef: React.RefObject<HTMLElement | null>
  data?: unknown
}

interface PickerPosition {
  x: number
  y: number
}

const EmojiPickerPortal = ({
  onEmojiClick,
  positionRef,
  data = defaultData,
  autoFocus = true,
  dynamicWidth = false,
  emojiButtonRadius = '100%',
  emojiButtonSize = 36,
  emojiSize = 24,
  icons = 'outline',
  locale = 'en',
  maxFrequentRows = 1,
  navPosition = 'bottom',
  noCountryFlags = false,
  noResultsEmoji = 'cry',
  perLine = 9,
  previewEmoji = null,
  previewPosition = 'none',
  searchPosition = 'sticky',
  set = 'native',
  skin = 1,
  skinTonePosition = 'preview',
}: EmojiPickerPortalProps) => {
  const [position, setPosition] = React.useState<PickerPosition | null>(null)
  const { darkMode } = React.useContext(InklingUiPrefsContext)

  const shiftPixels = 35 // how many pixels we want to move it up when it's at the bottom of the screen
  const handleScroll = React.useCallback(() => {
    if (positionRef.current) {
      const rect = positionRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const pickerHeight = 352 // Approximate height of the emoji picker, adjust if needed

      // position: fixed uses viewport coordinates, so use rect values directly
      let adjustedTop = rect.top

      if (adjustedTop + pickerHeight > windowHeight) {
        adjustedTop = rect.top - pickerHeight - shiftPixels
      }

      setPosition({ x: rect.left, y: adjustedTop })
    }
  }, [positionRef])

  React.useEffect(() => {
    handleScroll()
    document.addEventListener('scroll', handleScroll, true) // Use true for capture phase
    return () => {
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [handleScroll])

  if (!position) {
    return null
  }
  const { x, y } = position

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const style: React.CSSProperties = {
    left: x,
    top: y,
    position: 'fixed',
  }

  // https://github.com/missive/emoji-mart#options--props
  const defaultPickerProps: Omit<EmojiMartPickerOptions, 'data' | 'onEmojiSelect'> = {
    theme: darkMode ? 'dark' : 'light',
    autoFocus,
    dynamicWidth,
    emojiButtonRadius,
    emojiButtonSize,
    emojiSize,
    icons,
    locale,
    maxFrequentRows,
    navPosition,
    noCountryFlags,
    noResultsEmoji,
    perLine,
    previewEmoji,
    previewPosition,
    searchPosition,
    set,
    skin,
    skinTonePosition,
  }

  return (
    <Portal>
      <div
        className="z-20 mt-10 mr-9 rounded-md bg-white"
        data-testid="emoji-picker-container"
        style={style}
        onClick={handleClick}
      >
        <div className="">
          <Picker // https://github.com/missive/emoji-mart#-picker
            data={data}
            onEmojiSelect={onEmojiClick}
            {...defaultPickerProps}
          />
        </div>
      </div>
    </Portal>
  )
}

export default EmojiPickerPortal
