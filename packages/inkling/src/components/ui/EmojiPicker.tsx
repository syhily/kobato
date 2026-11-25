import EmojiPickerReact, {
  SkinTonePickerLocation,
  SuggestionMode,
  type EmojiClickData,
  type EmojiDataLoader,
} from 'emoji-picker-react'
import { useCallback } from 'react'
export interface EmojiPickerProps {
  colorScheme?: 'light' | 'dark' | 'auto'
  height: number
  width: number
  onEmojiSelect?: (emoji: { native?: string }) => void
  emojiData?: EmojiDataLoader
}

export default function EmojiPicker({
  colorScheme = 'light',
  height,
  width,
  onEmojiSelect,
  emojiData,
}: EmojiPickerProps) {
  const handleEmojiClick = useCallback(
    (clicked: EmojiClickData) => {
      onEmojiSelect?.({ native: clicked.emoji })
    },
    [onEmojiSelect],
  )

  return (
    <EmojiPickerReact
      autoFocusSearch
      colorScheme={colorScheme}
      cssLayer="inkling"
      emojiStyle="native"
      height={height}
      width={width}
      lazyLoadEmojis
      previewConfig={{ showPreview: false }}
      skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
      suggestedEmojisMode={SuggestionMode.FREQUENT}
      onEmojiClick={handleEmojiClick}
      {...(emojiData ? { emojiData } : {})}
    />
  )
}
