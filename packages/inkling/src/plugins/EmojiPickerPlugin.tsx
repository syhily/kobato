import type { TextNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import React from 'react'

import Portal from '@/components/ui/Portal'
import useTypeaheadTriggerMatch from '@/hooks/useTypeaheadTriggerMatch'
import trackEvent from '@/utils/analytics'

import {
  $insertSelectedEmoji,
  ensureEmojiSearchReady,
  registerEmojiExactMatchCompletion,
  searchEmojis,
  type EmojiSearchResult,
  type EmojiSkin,
} from './behaviour/emoji-completion'

class EmojiOption extends MenuOption {
  id: string
  skins: EmojiSkin[]

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
  // custom menuRenderFn we must attach each option's ref ourselves — through
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
      className={`mb-0 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 font-sans text-sm leading-[1.65] tracking-wide whitespace-nowrap text-grey-800 dark:text-grey-200 ${isSelected ? 'bg-grey-100 text-grey-900 dark:bg-grey-900 dark:text-white' : ''}`}
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

// Emoji picker adapter: owns the typeahead menu rendering and the query state,
// and delegates behaviour to the headless module in
// ./behaviour/emoji-completion (index lifecycle, query policy, exact-match
// completion, insertion surgeries). Analytics stays here — it is product
// glue, not tree policy; the surgeries return commit results to attach it to.
export function EmojiPickerPlugin() {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = React.useState<string | null>(null)
  const [fetchedResults, setSearchResults] = React.useState<EmojiOption[] | null>(null)
  // a closed query never shows stale results — derived at render instead of
  // cleared by an effect
  const searchResults = queryString ? fetchedResults : null

  const checkForTriggerMatch = useTypeaheadTriggerMatch(':', { minLength: 1 })

  React.useEffect(() => {
    ensureEmojiSearchReady()
  }, [])

  // the exact-match handler reads the query lazily so its registration is
  // stable per editor instead of re-registering on every keystroke
  const queryRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    queryRef.current = queryString
  }, [queryString])

  // handle exact match typed like :emoji:
  //  the typeahead menu does not account for exact matches/closing characters
  React.useEffect(() => {
    return registerEmojiExactMatchCompletion(editor, {
      getQuery: () => queryRef.current,
      onCommit: () => trackEvent('Emoji Inserted', { method: 'completed' }),
    })
  }, [editor])

  // latest-wins: a slow response from a superseded query must not overwrite
  // the newer query's results — compared against a ref, not state, so the
  // guard never closes over a stale query
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

  return (
    <LexicalTypeaheadMenuPlugin
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        if (anchorElementRef.current === null || !searchResults || searchResults.length === 0) {
          return null
        }
        return (
          <Portal className="w-[240px]" to={anchorElementRef.current}>
            <ul
              className="relative z-10 max-h-[214px] scroll-p-2 list-none overflow-y-auto rounded-md bg-white p-1 shadow-md  select-none dark:bg-grey-950"
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
      }}
      options={searchResults ?? []}
      triggerFn={checkForTriggerMatch}
      onQueryChange={setQueryString}
      onSelectOption={onEmojiSelect}
    />
  )
}

export default EmojiPickerPlugin
