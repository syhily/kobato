import defaultData from '@emoji-mart/data'
import Picker, { type EmojiMartPickerOptions } from '@kobato/inkling-internal/components/ui/EmojiPicker'
import Portal from '@kobato/inkling-internal/components/ui/Portal'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import React from 'react'

interface EmojiPickerPortalProps extends Omit<EmojiMartPickerOptions, 'data' | 'onEmojiSelect'> {
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

  const shiftPixels = 35
  const handleScroll = React.useCallback(() => {
    if (positionRef.current) {
      const rect = positionRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const pickerHeight = 352

      let adjustedTop = rect.top

      if (adjustedTop + pickerHeight > windowHeight) {
        adjustedTop = rect.top - pickerHeight - shiftPixels
      }

      setPosition({ x: rect.left, y: adjustedTop })
    }
  }, [positionRef])

  React.useEffect(() => {
    handleScroll()
    document.addEventListener('scroll', handleScroll, true)
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
          <Picker data={data} onEmojiSelect={onEmojiClick} {...defaultPickerProps} />
        </div>
      </div>
    </Portal>
  )
}

export default EmojiPickerPortal
