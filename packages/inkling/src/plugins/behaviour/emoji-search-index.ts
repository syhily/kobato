import emojiData from '@emoji-mart/data'
import { SearchIndex, init } from 'emoji-mart'
void init({ data: emojiData })

export async function searchEmojiMartIndex(query: string): Promise<unknown> {
  const results: unknown = await SearchIndex.search(query)
  return results
}
