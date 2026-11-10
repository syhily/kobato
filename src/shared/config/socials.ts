// The closed list of "branded" social network identifiers used by the `socials[]`
// settings array (fixed header icons + admin editor menu). Shared: the server Zod
// schema and the admin editor need the same list.

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export const SOCIAL_NETWORKS = ['github', 'x', 'wechat', 'weibo', 'qq'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export type SocialDisplayType = 'link' | 'qrcode'

// Canonical per-platform metadata for the admin editor: menu label + fixed
// display type, URL vs QR-code input choice, and the seeded user-visible name.
// `linkPlaceholder` is a hint, not validation.
//
// Display chrome is UI MESSAGE IDS (`labelId`, `linkLabelId`) so the editor and
// the navigation picker follow the admin locale. `brandName` is a proper noun for
// server interpolations. `defaultName` is SEED CONTENT: it keeps the pre-i18n
// strings verbatim so an existing row's stored name never changes with the UI
// locale.
export interface SocialNetworkMeta {
  network: SocialNetwork
  /** Editor/navigation label message id. */
  labelId: UiMessageId
  /** Locale-neutral brand name (proper noun) for server interpolations. */
  brandName: string
  type: SocialDisplayType
  /** Input label message id for the platform's display mode. */
  linkLabelId: UiMessageId
  linkPlaceholder: string
  /** Default text for the QR-code popup subtitle (`socials[].name`); editors can override per-row. */
  defaultName: string
}

export const SOCIAL_NETWORK_META: Record<SocialNetwork, SocialNetworkMeta> = {
  github: {
    network: 'github',
    labelId: 'admin.settings.socials.network.github',
    brandName: 'GitHub',
    type: 'link',
    linkLabelId: 'admin.settings.socials.linkLabel.homepage',
    linkPlaceholder: 'https://github.com/your-handle',
    defaultName: 'GitHub',
  },
  x: {
    network: 'x',
    labelId: 'admin.settings.socials.network.x',
    brandName: 'X',
    type: 'link',
    linkLabelId: 'admin.settings.socials.linkLabel.homepage',
    linkPlaceholder: 'https://x.com/your-handle',
    defaultName: 'X',
  },
  weibo: {
    network: 'weibo',
    labelId: 'admin.settings.socials.network.weibo',
    brandName: 'Weibo',
    type: 'link',
    linkLabelId: 'admin.settings.socials.linkLabel.homepage',
    linkPlaceholder: 'https://weibo.com/your-handle',
    defaultName: '微博',
  },
  wechat: {
    network: 'wechat',
    labelId: 'admin.settings.socials.network.wechat',
    brandName: 'WeChat',
    type: 'qrcode',
    linkLabelId: 'admin.settings.socials.linkLabel.qrcode',
    linkPlaceholder: 'https://u.wechat.com/xxxx',
    defaultName: '微信',
  },
  qq: {
    network: 'qq',
    labelId: 'admin.settings.socials.network.qq',
    brandName: 'QQ',
    type: 'qrcode',
    linkLabelId: 'admin.settings.socials.linkLabel.qrcode',
    linkPlaceholder: 'https://qm.qq.com/cgi-bin/qm/qr?...',
    defaultName: 'QQ',
  },
}

export function getSocialNetworkMeta(network: SocialNetwork): SocialNetworkMeta {
  return SOCIAL_NETWORK_META[network]
}
