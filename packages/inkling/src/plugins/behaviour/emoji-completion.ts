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

export interface EmojiSkin {
  native: string
}

export interface EmojiSearchResult {
  id: string
  skins: readonly [EmojiSkin, ...EmojiSkin[]]
}

export interface EmojiCommitResult {
  id: string
  native: string
}

export interface EmojiSearchIndexChunk {
  searchEmojiMartIndex: (query: string) => Promise<unknown>
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

function isEmojiSearchResult(value: unknown): value is EmojiSearchResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'skins' in value &&
    Array.isArray(value.skins) &&
    value.skins.length > 0 &&
    value.skins.every(
      (skin: unknown) =>
        typeof skin === 'object' && skin !== null && 'native' in skin && typeof skin.native === 'string',
    )
  )
}

async function searchEmojiIndex(query: string): Promise<EmojiSearchResult[]> {
  const { searchEmojiMartIndex } = await loadEmojiSearchIndex()
  const results: unknown = await searchEmojiMartIndex(query)
  if (!Array.isArray(results)) {
    return []
  }
  return results.filter(isEmojiSearchResult)
}

export async function searchEmojis(query: string): Promise<EmojiSearchResult[]> {
  const alias = EMOTICON_SEARCH_ALIASES[query]
  return searchEmojiIndex(alias ?? query)
}

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
  const shortcodeLength = emoji.id.length + 1
  const textNode = currentNode.spliceText(selection.anchor.offset - shortcodeLength, shortcodeLength, native, true)
  textNode.setFormat(selection.format)

  return { id: emoji.id, native }
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

  const native = emoji.skins[0].native
  const emojiNode = $createTextNode(native)
  emojiNode.setFormat(selection.format)

  selection.insertNodes([emojiNode])

  return { id: emoji.id, native }
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
}

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
        const emojis = await searchEmojiIndex(query)
        if (emojis.length === 0) {
          return
        }
        if (emojis[0].id !== query) {
          return
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
