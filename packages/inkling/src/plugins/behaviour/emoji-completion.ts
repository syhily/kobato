import emojiData from '@emoji-mart/data'
import { SearchIndex, init } from 'emoji-mart'
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type TextNode,
} from 'lexical'

// Headless half of the emoji picker: the emoji-mart index lifecycle
// (ensureEmojiSearchReady), the menu query policy (searchEmojis — including
// the emoticon alias table), the exact-match `:shortcode:` completion
// registration, and the two insertion surgeries. The React half
// (src/plugins/EmojiPickerPlugin.tsx) is a pure adapter: it owns the
// typeahead menu rendering, the query state, and product analytics — the
// surgeries here return commit results and the plugin attaches trackEvent
// calls to them (the at-link module's analytics-on-the-commit-result split).
//
// The two search paths differ deliberately (document why, don't flatten):
// - the menu query (searchEmojis) maps emoticon aliases before searching —
//   `:)` should list smileys
// - the exact-match completion searches the LITERAL query: its completion
//   check (first result's id === query) is meaningless against an aliased
//   search term, and the aliased queries never satisfy an exact match anyway

export interface EmojiSkin {
  native: string
}

/** The emoji-mart search-result shape consumers rely on (SearchIndex.search
 * returns `any`; this is the boundary annotation). */
export interface EmojiSearchResult {
  id: string
  skins: EmojiSkin[]
}

/** What an insertion surgery committed, so the caller can attach product
 * analytics; the surgeries return null when nothing was inserted. */
export interface EmojiCommitResult {
  id: string
  native: string
}

// emoji-mart's init is a global side effect; run it once on first use instead
// of at module import time
let emojiDataInitialized = false

export function ensureEmojiSearchReady() {
  if (emojiDataInitialized) {
    return
  }
  emojiDataInitialized = true
  void init({ data: emojiData })
}

// Emoticon aliases: typing an emoticon after the ':' trigger searches its
// emoji equivalent
const EMOTICON_SEARCH_ALIASES: Record<string, string> = {
  ')': 'smile',
  '-)': 'smile',
  '(': 'frown',
  '-(': 'frown',
}

// emoji-mart's SearchIndex.search returns any — one annotated cast at the
// boundary; every call site goes through this
async function searchEmojiIndex(query: string): Promise<EmojiSearchResult[]> {
  return (await SearchIndex.search(query)) as EmojiSearchResult[]
}

// The typeahead menu's query policy.
export async function searchEmojis(query: string): Promise<EmojiSearchResult[]> {
  const alias = EMOTICON_SEARCH_ALIASES[query]
  return searchEmojiIndex(alias ?? query)
}

// Exact-match completion surgery: replace the `:id` shortcode ending at the
// caret with the emoji's native character, keeping the caret's text format.
// The caret is expected to sit right after the query text (the keydown-time
// shape — the registration below prevents the closing ':' from ever being
// inserted), so the deleted span is the query plus its leading colon.
export function $insertEmojiCompletion(emoji: EmojiSearchResult): EmojiCommitResult | null {
  const selection = $getSelection()

  if (!$isRangeSelection(selection)) {
    return null
  }

  const currentNode = selection.anchor.getNode()
  if (!$isTextNode(currentNode)) {
    return null
  }

  const native = emoji.skins[0].native
  const shortcodeLength = emoji.id.length + 1 // +1 for the shortcode's leading colon
  const textNode = currentNode.spliceText(selection.anchor.offset - shortcodeLength, shortcodeLength, native, true)
  textNode.setFormat(selection.format)

  return { id: emoji.id, native }
}

// Menu-select surgery: drop the query text node the typeahead split out (when
// it did) and insert the emoji's native character at the caret, keeping the
// caret's text format.
export function $insertSelectedEmoji(
  emoji: EmojiSearchResult,
  nodeToRemove: TextNode | null,
): EmojiCommitResult | null {
  const selection = $getSelection()

  if (!$isRangeSelection(selection)) {
    return null
  }

  if (nodeToRemove) {
    const removedText = nodeToRemove.getTextContent()
    const previousSibling = nodeToRemove.getPreviousSibling()
    nodeToRemove.remove()

    // The typeahead's split state can leave the trigger ':' in the text node
    // BEFORE nodeToRemove (rapid typing re-splits the query, and the last
    // split can start after the colon) — when the removal span carries no
    // leading ':', consume the trailing ':' of the previous sibling so the
    // commit always eats the full `:query`. The guard keeps a legitimately
    // typed colon before the trigger (e.g. "note: :tac" — the trigger colon
    // rides nodeToRemove there, so no sibling consumption happens) untouched.
    if (!removedText.startsWith(':') && previousSibling && $isTextNode(previousSibling)) {
      const previousText = previousSibling.getTextContent()
      if (previousText.endsWith(':')) {
        previousSibling.spliceText(previousText.length - 1, 1, '', true)
      }
    }
  }

  const native = emoji.skins[0].native
  const emojiNode = $createTextNode(native)
  emojiNode.setFormat(selection.format)

  selection.insertNodes([emojiNode])

  return { id: emoji.id, native }
}

// The inline-code guard: an active query inside code-formatted text must not
// complete — `:shortcode:` stays literal there.
function $caretHasCodeFormat(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return false
  }
  const node = selection.anchor.getNode()
  return $isTextNode(node) && node.hasFormat('code')
}

export interface RegisterEmojiExactMatchCompletionOptions {
  getQuery: () => string | null
  onCommit?: (result: EmojiCommitResult) => void
}

// Exact-match completion policy: while a typeahead query is active, a ':'
// keydown searches the index and — only when the first hit's id IS the query
// — replaces the whole `:shortcode:` with the emoji (the typeahead menu
// itself has no notion of exact matches or closing characters). The query is
// read lazily via getQuery so the registration is stable per editor instead
// of re-registering on every keystroke.
//
// Timing note: the search runs async, but its continuation is a microtask of
// the keydown dispatch, so event.preventDefault() still lands before the
// browser's default insertion — the closing ':' never reaches the text and
// the splice in $insertEmojiCompletion sees the pre-colon caret shape.
export function registerEmojiExactMatchCompletion(
  editor: LexicalEditor,
  { getQuery, onCommit }: RegisterEmojiExactMatchCompletionOptions,
) {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      const query = getQuery()
      if (!query || event.key !== ':') {
        return false
      }
      if (editor.getEditorState().read($caretHasCodeFormat)) {
        return false
      }
      void (async () => {
        // literal query, not searchEmojis — see the module header
        const emojis = await searchEmojiIndex(query)
        if (emojis.length === 0) {
          return
        }
        if (emojis[0].id !== query) {
          return // only look for exact match
        }
        editor.update(() => {
          const committed = $insertEmojiCompletion(emojis[0])
          if (committed) {
            onCommit?.(committed)
          }
        })
        event.preventDefault()
      })()
      return false
    },
    COMMAND_PRIORITY_HIGH,
  )
}
