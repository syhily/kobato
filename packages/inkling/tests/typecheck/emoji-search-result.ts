import type { EmojiSearchResult } from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'

import { $insertSelectedEmoji } from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'

const taco: EmojiSearchResult = { unified: '1f32e', emoji: '🌮', names: ['mexican', 'taco'], addedIn: '1' }

const native: string = taco.emoji
void native

// @ts-expect-error - names is required: an entry without search names is not a valid result
const noNamesResult: EmojiSearchResult = { unified: '1f32e', emoji: '🌮', addedIn: '1' }
void noNamesResult

// @ts-expect-error - the emoji-mart shape is gone: entries carry unified, not id/skins
$insertSelectedEmoji({ id: 'taco', skins: [{ native: '🌮' }], names: ['taco'], addedIn: '1' }, null)

// @ts-expect-error - insertion consumes a full search result, not a bare commit pair
$insertSelectedEmoji({ unified: '1f32e', emoji: '🌮' }, null)
