import type { TextNode } from 'lexical'

import Portal from '@kobato/inkling-internal/components/ui/Portal'
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
import React from 'react'

class EmojiOption extends MenuOption {
  id: string
  skins: EmojiSearchResult['skins']

  constructor(emoji: EmojiSearchResult) {
    super(emoji.id)
    this.id = emoji.id
    this.skins = emoji.skins
  }
}

interface EmojiMenuItemProps {
  index: number
  isSelected: boolean
  onClick: (event: React.MouseEvent) => void
  onMouseEnter: () => void
  emoji: EmojiOption
}

const EmojiMenuItem = function ({ index, isSelected, onClick, onMouseEnter, emoji }: EmojiMenuItemProps) {
  // the typeahead scrolls the selected option into view via option.ref; with a
  // custom menuRenderFn each option's ref must be attached manually — through
  // the option's own callback ref, invoked at commit (no render-time mutation)
  const attachRef = React.useCallback(
    (element: HTMLLIElement | null) => {
      emoji.setRefElement(element)
    },
    [emoji],
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
      <span className="font-serif text-lg">{emoji.skins[0].native}</span>
      <span className="truncate">{emoji.id}</span>
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
  anchorElementRef: React.RefObject<HTMLElement | null>,
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
        {searchResults.map((emoji, index) => (
          <EmojiMenuItem
            key={emoji.id}
            emoji={emoji}
            index={index}
            isSelected={selectedIndex === index}
            onClick={(event) => {
              setHighlightedIndex(index)
              selectOptionAndCleanUp(emoji)
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
  const [queryString, setQueryString] = React.useState<string | null>(null)
  const [fetchedResults, setSearchResults] = React.useState<EmojiOption[] | null>(null)
  const searchResults = queryString ? fetchedResults : null
  const checkForTriggerMatch = useTypeaheadTriggerMatch(':', { minLength: 1 })

  const queryRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    queryRef.current = queryString
  }, [queryString])

  React.useEffect(() => {
    return registerEmojiExactMatchCompletion(editor, {
      getQuery: () => queryRef.current,
      onCommit: () => trackEvent('Emoji Inserted', { method: 'completed' }),
    })
  }, [editor])

  const latestQueryRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!queryString) {
      return
    }
    const query = queryString
    latestQueryRef.current = query

    void searchEmojis(query)
      .then((emojis) => {
        if (latestQueryRef.current !== query) {
          return
        }
        setSearchResults(emojis.map((emoji) => new EmojiOption(emoji)))
      })
      .catch(() => {
        // a failed search shows no suggestions instead of rejecting unhandled
        if (latestQueryRef.current === query) {
          setSearchResults(null)
        }
      })
  }, [queryString])

  const onEmojiSelect = React.useCallback(
    (selectedOption: EmojiOption, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const committed = $insertSelectedEmoji(selectedOption, nodeToRemove)
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
