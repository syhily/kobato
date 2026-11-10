// The admin-only label registry for the Gravatar mirror presets. Preset URLs
// live in `@/shared/utils/safe-url` (the public avatar graph imports it, so it
// must not carry workspace catalog ids); `satisfies Record<GravatarMirrorUrl, …>`
// keeps the mapping exhaustive — a new preset URL without its label fails `pnpm run type`.

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { GravatarMirrorUrl } from '@/shared/utils/safe-url'

import { GRAVATAR_MIRROR_URLS } from '@/shared/utils/safe-url'

const MIRROR_LABEL_KEYS = {
  'https://www.gravatar.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.gravatarOfficial',
  'https://cn.gravatar.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.gravatarCn',
  'https://secure.gravatar.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.gravatarSecure',
  'https://gravatar.loli.net/avatar': 'admin.settings.comments.avatar.mirrorPreset.loliNet',
  'https://sdn.geekzu.org/avatar': 'admin.settings.comments.avatar.mirrorPreset.geekzu',
  'https://cdn.v2ex.com/gravatar': 'admin.settings.comments.avatar.mirrorPreset.v2ex',
  'https://cravatar.cn/avatar': 'admin.settings.comments.avatar.mirrorPreset.cravatarCn',
  'https://cravatar.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.cravatar',
  'https://seccdn.libravatar.org/gravatarproxy': 'admin.settings.comments.avatar.mirrorPreset.libravatarProxy',
  'https://weavatar.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.weavatar',
  'https://gravatar.webp.se/avatar': 'admin.settings.comments.avatar.mirrorPreset.webpSe',
  'https://gravatar.zeruns.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.zeruns',
  'https://gravatar.zeruns.tech/avatar': 'admin.settings.comments.avatar.mirrorPreset.zerunsTech',
  'https://cdn.sep.cc/avatar': 'admin.settings.comments.avatar.mirrorPreset.sepCc',
  'https://gravatar.w3tt.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.w3tt',
  'https://use.sevencdn.com/avatar': 'admin.settings.comments.avatar.mirrorPreset.sevenCdn',
} as const satisfies Record<GravatarMirrorUrl, UiMessageId>

/** Preset URLs paired with their catalog labels, in display order. */
export const GRAVATAR_MIRROR_PRESETS: ReadonlyArray<{ value: GravatarMirrorUrl; labelKey: UiMessageId }> =
  GRAVATAR_MIRROR_URLS.map((value) => ({ value, labelKey: MIRROR_LABEL_KEYS[value] }))
