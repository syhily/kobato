/**
 * Compile-time pins for the emoji search-result boundary contract
 * (`@/inkling/plugins/behaviour/emoji-completion`): consumers read
 * `skins[0].native`, so the validated type carries a non-empty tuple and an
 * empty-skins literal cannot reach the insertion surgeries. The runtime guard
 * in `isEmojiSearchResult` drops such entries at the boundary.
 *
 * This file is included by the root tsconfig and is only type-checked — it is
 * never executed and contains no runtime assertions.
 */
import type { EmojiSearchResult } from '@/inkling/plugins/behaviour/emoji-completion'

import { $insertSelectedEmoji } from '@/inkling/plugins/behaviour/emoji-completion'

const taco: EmojiSearchResult = { id: 'taco', skins: [{ native: '🌮' }] }

// the reader every consumer relies on is total
const native: string = taco.skins[0].native
void native

// @ts-expect-error - skins is a non-empty tuple: an empty list has no `skins[0]`
const emptySkinsResult: EmojiSearchResult = { id: 'taco', skins: [] }
void emptySkinsResult

// @ts-expect-error - an empty-skins entry cannot reach an insertion surgery
$insertSelectedEmoji({ id: 'taco', skins: [] }, null)
