import type { EmojiDataLoader } from 'emoji-picker-react'

import EmojiPicker from '@kobato/inkling-internal/components/ui/EmojiPicker'
import Portal from '@kobato/inkling-internal/components/ui/Portal'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { loadEmojiDataset, type EmojiLocale } from '@kobato/inkling-internal/plugins/behaviour/emoji-datasets'
import {
  type RefObject,
  type MouseEvent,
  type CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
interface EmojiPickerPortalProps {
  onEmojiClick: (emoji: { native?: string }) => void
  positionRef: RefObject<HTMLElement | null>
}

interface PickerPosition {
  x: number
  y: number
}

const PICKER_HEIGHT = 352
const PICKER_WIDTH = 350
const SHIFT_PIXELS = 35

const EMOJI_PICKER_DATASET_LOADERS: Partial<Record<EmojiLocale, EmojiDataLoader>> = {
  zh: () => loadEmojiDataset('zh'),
  'zh-hant': () => loadEmojiDataset('zh-hant'),
}

const EmojiPickerPortal = ({ onEmojiClick, positionRef }: EmojiPickerPortalProps) => {
  const [position, setPosition] = useState<PickerPosition | null>(null)
  const { darkMode, emojiLocale } = useContext(InklingUiPrefsContext)

  const handleScroll = useCallback(() => {
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

  useEffect(() => {
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

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
  }

  const style: CSSProperties = {
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
