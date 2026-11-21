import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

export const SOCIAL_NETWORKS = ['github', 'x', 'wechat', 'weibo', 'qq'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export type SocialDisplayType = 'link' | 'qrcode'

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
