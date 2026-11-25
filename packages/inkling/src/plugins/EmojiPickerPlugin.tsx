import type { TextNode } from 'lexical'

import Portal from '@kobato/inkling-internal/components/ui/Portal'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import useTypeaheadTriggerMatch from '@kobato/inkling-internal/hooks/useTypeaheadTriggerMatch'
import {
  $insertSelectedEmoji,
  registerEmojiExactMatchCompletion,
  searchEmojis,
  type EmojiSearchResult,
} from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'
import trackEvent from '@kobato/inkling-internal/utils/analytics'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { type MouseEvent, type RefObject, useCallback, useContext, useEffect, useRef, useState } from 'react'
class EmojiOption extends MenuOption {
  emoji: EmojiSearchResult

  constructor(emoji: EmojiSearchResult) {
    super(emoji.unified)
    this.emoji = emoji
  }
}

interface EmojiMenuItemProps {
  index: number
  isSelected: boolean
  onClick: (event: MouseEvent) => void
  onMouseEnter: () => void
  option: EmojiOption
}

const EmojiMenuItem = function ({ index, isSelected, onClick, onMouseEnter, option }: EmojiMenuItemProps) {
  const { emoji, names } = option.emoji
  const attachRef = useCallback(
    (element: HTMLLIElement | null) => {
      option.setRefElement(element)
    },
    [option],
  )
  return (
    <li
      ref={attachRef}
      aria-selected={isSelected}
      className={`text-grey-800 dark:text-grey-200 mb-0 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 font-sans text-sm leading-[1.65] tracking-wide whitespace-nowrap ${isSelected ? 'bg-grey-100 text-grey-900 dark:bg-grey-900 dark:text-white' : ''}`}
      data-testid={'emoji-option-' + index}
      id={'emoji-option-' + index}
      role="option"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="font-serif text-lg">{emoji}</span>
      <span className="truncate">{names[names.length - 1]}</span>
    </li>
  )
}

function getPositionStyles() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return {}
  }
  const selectedRange = selection.getRangeAt(0)
  const rangeRect = selectedRange.getBoundingClientRect()

  return {
    marginTop: `${rangeRect.height}px`,
  }
}

function renderEmojiMenu(
  anchorElementRef: RefObject<HTMLElement | null>,
  searchResults: EmojiOption[] | null,
  selectedIndex: number | null,
  selectOptionAndCleanUp: (option: EmojiOption) => void,
  setHighlightedIndex: (index: number) => void,
) {
  if (anchorElementRef.current === null || !searchResults || searchResults.length === 0) {
    return null
  }
  return (
    <Portal className="w-[24rem]" to={anchorElementRef.current}>
      <ul
        className="dark:bg-grey-950 relative z-10 max-h-[21.4rem] scroll-p-2 list-none overflow-y-auto rounded-md bg-white p-1  shadow-md select-none"
        data-testid="emoji-menu"
        style={getPositionStyles()}
      >
        {searchResults.map((option, index) => (
          <EmojiMenuItem
            key={option.emoji.unified}
            option={option}
            index={index}
            isSelected={selectedIndex === index}
            onClick={(event) => {
              setHighlightedIndex(index)
              selectOptionAndCleanUp(option)
              event.stopPropagation()
              event.preventDefault()
            }}
            onMouseEnter={() => {
              setHighlightedIndex(index)
            }}
          />
        ))}
      </ul>
    </Portal>
  )
}

export function EmojiPickerPlugin() {
  const [editor] = useLexicalComposerContext()
  const { emojiLocale } = useContext(InklingUiPrefsContext)
  const [queryString, setQueryString] = useState<string | null>(null)
  const [fetchedResults, setSearchResults] = useState<EmojiOption[] | null>(null)
  const searchResults = queryString ? fetchedResults : null
  const checkForTriggerMatch = useTypeaheadTriggerMatch(':', { minLength: 1 })

  const queryRef = useRef<string | null>(null)
  useEffect(() => {
    queryRef.current = queryString
  }, [queryString])

  useEffect(() => {
    return registerEmojiExactMatchCompletion(editor, {
      getQuery: () => queryRef.current,
      onCommit: () => trackEvent('Emoji Inserted', { method: 'completed' }),
      locale: emojiLocale,
    })
  }, [editor, emojiLocale])

  const latestQueryRef = useRef<string | null>(null)
  useEffect(() => {
    if (!queryString) {
      return
    }
    const query = queryString
    latestQueryRef.current = query

    void searchEmojis(query, emojiLocale)
      .then((emojis) => {
        if (latestQueryRef.current !== query) {
          return
        }
        setSearchResults(emojis.map((emoji) => new EmojiOption(emoji)))
      })
      .catch(() => {
        if (latestQueryRef.current === query) {
          setSearchResults(null)
        }
      })
  }, [queryString, emojiLocale])

  const onEmojiSelect = useCallback(
    (selectedOption: EmojiOption, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const committed = $insertSelectedEmoji(selectedOption.emoji, nodeToRemove)
        if (!committed) {
          return
        }

        closeMenu()

        trackEvent('Emoji Inserted', { method: 'selected' })
      })
    },
    [editor],
  )

  return (
    <LexicalTypeaheadMenuPlugin
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        renderEmojiMenu(anchorElementRef, searchResults, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex)
      }
      options={searchResults ?? []}
      triggerFn={checkForTriggerMatch}
      onQueryChange={setQueryString}
      onSelectOption={onEmojiSelect}
    />
  )
}

export default EmojiPickerPlugin
