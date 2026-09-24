// The emoji-mart runtime chunk: `@emoji-mart/data`'s inlined JSON plus the
// SearchIndex, pulled out of the editor island and loaded on demand through
// the import port in `./emoji-completion` (first ':' typeahead query). init()
// is emoji-mart's process-global side effect — running it at module eval lets
// ESM module caching serve as the exactly-once guard (the port's cached
// promise additionally gates the import itself).
import emojiData from '@emoji-mart/data'
import { SearchIndex, init } from 'emoji-mart'

void init({ data: emojiData })

// SearchIndex.search returns any — the port's consumer
// (./emoji-completion) validates the shape at the boundary.
export async function searchEmojiMartIndex(query: string): Promise<unknown> {
  const results: unknown = await SearchIndex.search(query)
  return results
}
