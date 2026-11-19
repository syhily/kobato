import type { EmojiSearchResult } from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'

import { $insertSelectedEmoji } from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'

const taco: EmojiSearchResult = { id: 'taco', skins: [{ native: '🌮' }] }

const native: string = taco.skins[0].native
void native

// @ts-expect-error - skins is a non-empty tuple: an empty list has no `skins[0]`
const emptySkinsResult: EmojiSearchResult = { id: 'taco', skins: [] }
void emptySkinsResult

// @ts-expect-error - an empty-skins entry cannot reach an insertion surgery
$insertSelectedEmoji({ id: 'taco', skins: [] }, null)
