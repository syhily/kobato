import type { EmojiLocale } from '@kobato/inkling-internal/plugins/behaviour/emoji-datasets'

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

export interface EmojiSearchResult {
  unified: string
  emoji: string
  names: readonly string[]
  addedIn: string
}

export interface EmojiCommitResult {
  unified: string
  emoji: string
}

export interface EmojiSearchIndexChunk {
  searchEmojiDataset: (query: string, locale?: EmojiLocale) => Promise<readonly EmojiSearchResult[]>
}

export type LoadEmojiSearchIndex = () => Promise<EmojiSearchIndexChunk>

let indexChunkPromise: Promise<EmojiSearchIndexChunk> | null = null

function loadEmojiSearchIndex(
  load: LoadEmojiSearchIndex = () => import('@kobato/inkling-internal/plugins/behaviour/emoji-search-index'),
): Promise<EmojiSearchIndexChunk> {
  indexChunkPromise ??= load()
  return indexChunkPromise
}

export function ensureEmojiSearchReady(): Promise<void> {
  return loadEmojiSearchIndex().then(() => undefined)
}

const EMOTICON_SEARCH_ALIASES: Record<string, string> = {
  ')': 'smile',
  '-)': 'smile',
  '(': 'frown',
  '-(': 'frown',
}

async function searchEmojiIndex(query: string, locale?: EmojiLocale): Promise<EmojiSearchResult[]> {
  const { searchEmojiDataset } = await loadEmojiSearchIndex()
  return [...(await searchEmojiDataset(query, locale))]
}

export async function searchEmojis(query: string, locale?: EmojiLocale): Promise<EmojiSearchResult[]> {
  const alias = EMOTICON_SEARCH_ALIASES[query]
  return searchEmojiIndex(alias ?? query, locale)
}

export function $insertEmojiCompletion(emoji: EmojiSearchResult, query: string): EmojiCommitResult | null {
  const selection = $getSelection()

  if (!$isRangeSelection(selection)) {
    return null
  }

  const currentNode = selection.anchor.getNode()
  if (!$isTextNode(currentNode)) {
    return null
  }

  const shortcodeLength = query.length + 1
  const textNode = currentNode.spliceText(selection.anchor.offset - shortcodeLength, shortcodeLength, emoji.emoji, true)
  textNode.setFormat(selection.format)

  return { unified: emoji.unified, emoji: emoji.emoji }
}

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

    if (!removedText.startsWith(':') && previousSibling && $isTextNode(previousSibling)) {
      const previousText = previousSibling.getTextContent()
      if (previousText.endsWith(':')) {
        previousSibling.spliceText(previousText.length - 1, 1, '', true)
      }
    }
  }

  const emojiNode = $createTextNode(emoji.emoji)
  emojiNode.setFormat(selection.format)

  selection.insertNodes([emojiNode])

  return { unified: emoji.unified, emoji: emoji.emoji }
}

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
  locale?: EmojiLocale
}

export function registerEmojiExactMatchCompletion(
  editor: LexicalEditor,
  { getQuery, onCommit, locale }: RegisterEmojiExactMatchCompletionOptions,
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
        const emojis = await searchEmojiIndex(query, locale)
        const match = emojis[0]
        if (!match) {
          return
        }
        const normalizedQuery = query.toLowerCase()
        if (!match.names.some((name) => name.toLowerCase() === normalizedQuery)) {
          return
        }
        editor.update(() => {
          const committed = $insertEmojiCompletion(match, query)
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
