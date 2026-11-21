import type { EmojiDataLoader } from 'emoji-picker-react'

import EmojiPicker from '@kobato/inkling-internal/components/ui/EmojiPicker'
import Portal from '@kobato/inkling-internal/components/ui/Portal'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { loadEmojiDataset, type EmojiLocale } from '@kobato/inkling-internal/plugins/behaviour/emoji-datasets'
import React from 'react'

interface EmojiPickerPortalProps {
  onEmojiClick: (emoji: { native?: string }) => void
  positionRef: React.RefObject<HTMLElement | null>
}

interface PickerPosition {
  x: number
  y: number
}

const PICKER_HEIGHT = 352
const PICKER_WIDTH = 350
const SHIFT_PIXELS = 35

// en stays absent: the picker's entry import already registers the bundled English dataset, so an
// en loader would only add an async hop over the same data. Hoisted at module scope — the library
// reloads a dataset on every new loader identity. Delegates to the shared dataset table, so the
// picker and the typeahead search share each locale's chunk and cache entry.
const EMOJI_PICKER_DATASET_LOADERS: Partial<Record<EmojiLocale, EmojiDataLoader>> = {
  zh: () => loadEmojiDataset('zh'),
  'zh-hant': () => loadEmojiDataset('zh-hant'),
}

const EmojiPickerPortal = ({ onEmojiClick, positionRef }: EmojiPickerPortalProps) => {
  const [position, setPosition] = React.useState<PickerPosition | null>(null)
  const { darkMode, emojiLocale } = React.useContext(InklingUiPrefsContext)

  const handleScroll = React.useCallback(() => {
    if (positionRef.current) {
      const rect = positionRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight

      let adjustedTop = rect.top

      if (adjustedTop + PICKER_HEIGHT > windowHeight) {
        adjustedTop = rect.top - PICKER_HEIGHT - SHIFT_PIXELS
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

  return (
    <Portal>
      <div
        className="dark:bg-grey-950 z-20 mt-10 mr-9 overflow-hidden rounded-md bg-white shadow-md"
        data-testid="emoji-picker-container"
        style={style}
        onClick={handleClick}
      >
        <EmojiPicker
          colorScheme={darkMode ? 'dark' : 'light'}
          emojiData={emojiLocale ? EMOJI_PICKER_DATASET_LOADERS[emojiLocale] : undefined}
          height={PICKER_HEIGHT}
          width={PICKER_WIDTH}
          onEmojiSelect={onEmojiClick}
        />
      </div>
    </Portal>
  )
}

export default EmojiPickerPortal
