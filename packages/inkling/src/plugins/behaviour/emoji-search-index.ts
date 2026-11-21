import { loadEmojiDataset, type EmojiLocale } from '@kobato/inkling-internal/plugins/behaviour/emoji-datasets'
import { searchEmojis, type EmojiInfo } from 'emoji-picker-react/data'

export type { EmojiLocale }

export async function searchEmojiDataset(query: string, locale: EmojiLocale = 'en'): Promise<readonly EmojiInfo[]> {
  const searchLocales: readonly EmojiLocale[] = locale === 'en' ? ['en'] : [locale, 'en']
  const datasets = await Promise.all(searchLocales.map(loadEmojiDataset))
  const unifiedSeen = new Set<string>()
  const results: EmojiInfo[] = []
  for (const emojiData of datasets) {
    for (const emoji of searchEmojis(query, { emojiData })) {
      if (unifiedSeen.has(emoji.unified)) {
        continue
      }
      unifiedSeen.add(emoji.unified)
      results.push(emoji)
    }
  }
  return results
}
