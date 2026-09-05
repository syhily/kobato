import type { InitialEditorStateType } from '@lexical/react/LexicalComposer'
import type { LexicalEditor } from 'lexical'

import React from 'react'

import InklingNestedEditor from '@/components/InklingNestedEditor'
import EmojiPickerPortal from '@/components/ui/EmojiPickerPortal'
import { ReadOnlyOverlay } from '@/components/ui/ReadOnlyOverlay'
import { ColorOptionSetting, SettingsPanel, ToggleSetting } from '@/components/ui/SettingsPanel'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { lookupLabel } from '@/labels/inkling-labels'

export type CalloutColorName = 'white' | 'grey' | 'blue' | 'green' | 'yellow' | 'red' | 'pink' | 'purple' | 'accent'

export const CALLOUT_COLORS: Record<CalloutColorName, string> = {
  white: 'bg-transparent border-grey/30',
  grey: 'bg-grey/10 border-transparent',
  blue: 'bg-blue/10 border-transparent',
  green: 'bg-green/10 border-transparent',
  yellow: 'bg-yellow/10 border-transparent',
  red: 'bg-red/10 border-transparent',
  pink: 'bg-pink/10 border-transparent',
  purple: 'bg-purple/10 border-transparent',
  accent: 'bg-accent border-transparent',
}

const TEXT_BLACK = 'text-black dark:text-grey-300 caret-black dark:caret-grey-300'
const TEXT_WHITE = 'text-white caret-white'

export const CALLOUT_TEXT_COLORS: Record<CalloutColorName, string> = {
  white: TEXT_BLACK,
  grey: TEXT_BLACK,
  blue: TEXT_BLACK,
  green: TEXT_BLACK,
  yellow: TEXT_BLACK,
  red: TEXT_BLACK,
  pink: TEXT_BLACK,
  purple: TEXT_BLACK,
  // .inkling-callout-accent makes sure links are not in accent color anymore
  accent: TEXT_WHITE + ' inkling-callout-accent',
}

export const calloutColorPicker = [
  {
    label: 'White',
    name: 'white',
    color: 'bg-transparent border-black/15 dark:border-white/10',
  },
  {
    label: 'Grey',
    name: 'grey',
    color: 'bg-grey/20 border-black/[0.08] dark:border-white/10',
  },
  {
    label: 'Blue',
    name: 'blue',
    color: 'bg-blue/20 border-black/[0.08] dark:border-white/10',
  },
  {
    label: 'Green',
    name: 'green',
    color: 'bg-green/20 border-black/[0.08] dark:border-white/10',
  },
  {
    label: 'Yellow',
    name: 'yellow',
    color: 'bg-yellow/20 border-black/[0.08] dark:border-white/10',
  },
  {
    label: 'Red',
    name: 'red',
    color: 'bg-red/20 border-black/[0.08] dark:border-white/10',
  },
  {
    label: 'Pink',
    name: 'pink',
    color: 'bg-pink/20 border-black/[0.08] dark:border-white/10',
  },
  {
    label: 'Purple',
    name: 'purple',
    color: 'bg-purple/20 border-black/[0.08] dark:border-white/10',
  },
  {
    label: 'Accent',
    name: 'accent',
    color: 'bg-accent border-black/[0.08] dark:border-white/10',
  },
]

interface CalloutCardProps {
  color?: CalloutColorName
  isEditing?: boolean
  setShowEmojiPicker?: (show: boolean) => void
  toggleEmoji: (checked: boolean) => void
  hasEmoji?: boolean
  handleColorChange?: (name?: string) => void
  changeEmoji: (emoji: { native?: string }) => void
  calloutEmoji?: string
  textEditor: LexicalEditor
  textEditorInitialState?: InitialEditorStateType
  nodeKey?: string
  toggleEmojiPicker?: () => void
  showEmojiPicker?: boolean
}

export function CalloutCard({
  color = 'green',
  isEditing,
  setShowEmojiPicker,
  toggleEmoji,
  hasEmoji = true,
  // stories render without a color-change handler; the picker becomes a no-op
  handleColorChange = () => {},
  changeEmoji,
  calloutEmoji = '💡',
  textEditor,
  textEditorInitialState,
  nodeKey,
  toggleEmojiPicker,
  showEmojiPicker,
}: CalloutCardProps) {
  const emojiButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const { darkMode } = React.useContext(InklingUiPrefsContext)
  const labels = useInklingLabels()

  // The picker table keeps its English labels as defaults; the host's label
  // table overrides each entry by its color name.
  const colorButtons = calloutColorPicker.map((entry) => ({
    ...entry,
    label: lookupLabel(labels, `color.${entry.name}`, entry.label),
  }))

  React.useEffect(() => {
    if (!isEditing) {
      setShowEmojiPicker?.(false)
    }
  }, [isEditing, setShowEmojiPicker])

  return (
    <>
      <div className={`flex rounded-md border px-7 py-5 ${CALLOUT_COLORS[color]} `} data-testid={`callout-bg-${color}`}>
        <div>
          {hasEmoji && (
            <>
              <button
                ref={emojiButtonRef}
                className={`mr-2 cursor-pointer rounded-md px-2 text-xl ${isEditing ? 'hover:bg-grey-500/20' : ''} `}
                data-testid="emoji-picker-button"
                type="button"
                onClick={toggleEmojiPicker}
              >
                {calloutEmoji}
              </button>
              {isEditing && showEmojiPicker && (
                <EmojiPickerPortal positionRef={emojiButtonRef} onEmojiClick={changeEmoji} />
              )}
            </>
          )}
        </div>
        <InklingNestedEditor
          autoFocus={true}
          defaultInklingEnterBehaviour={true}
          initialEditor={textEditor}
          initialEditorState={textEditorInitialState}
          nodes="minimal"
          placeholderClassName={`font-serif text-xl font-normal tracking-wide text-grey-500 !dark:text-white opacity-30`}
          placeholderText={labels['callout.text.placeholder']}
          singleParagraph={true}
          textClassName={`!my-0 w-full whitespace-normal bg-transparent font-serif text-xl font-normal ${CALLOUT_TEXT_COLORS[color]}`}
        />
      </div>
      {isEditing ? (
        <SettingsPanel darkMode={darkMode}>
          <ToggleSetting
            dataTestId="emoji-toggle"
            isChecked={!!calloutEmoji}
            label={labels['settings.emoji']}
            onChange={toggleEmoji}
          />
          <ColorOptionSetting
            buttons={colorButtons}
            dataTestId="callout-color-picker"
            label={labels['settings.background']}
            selectedName={color}
            onClick={handleColorChange}
          />
        </SettingsPanel>
      ) : (
        <ReadOnlyOverlay />
      )}
    </>
  )
}
