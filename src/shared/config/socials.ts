// The closed list of "branded" social network identifiers used by the
// `socials[]` settings array (fixed header icons + admin editor menu).
// Shared: the server Zod schema and the admin editor need the same list.
export const SOCIAL_NETWORKS = ['github', 'x', 'wechat', 'weibo', 'qq'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export type SocialDisplayType = 'link' | 'qrcode'

// Canonical per-platform metadata for the admin editor: menu label +
// fixed display type, URL vs QR-code input choice, and the seeded
// user-visible name. `linkPlaceholder` is a hint, not validation.
export interface SocialNetworkMeta {
  network: SocialNetwork
  label: string
  type: SocialDisplayType
  linkLabel: string
  linkPlaceholder: string
  /** Default text for the QR-code popup subtitle (`socials[].name`); editors can override per-row. */
  defaultName: string
}

export const SOCIAL_NETWORK_META: Record<SocialNetwork, SocialNetworkMeta> = {
  github: {
    network: 'github',
    label: 'GitHub',
    type: 'link',
    linkLabel: '主页链接',
    linkPlaceholder: 'https://github.com/your-handle',
    defaultName: 'GitHub',
  },
  x: {
    network: 'x',
    label: 'X',
    type: 'link',
    linkLabel: '主页链接',
    linkPlaceholder: 'https://x.com/your-handle',
    defaultName: 'X',
  },
  weibo: {
    network: 'weibo',
    label: '微博',
    type: 'link',
    linkLabel: '主页链接',
    linkPlaceholder: 'https://weibo.com/your-handle',
    defaultName: '微博',
  },
  wechat: {
    network: 'wechat',
    label: '微信',
    type: 'qrcode',
    linkLabel: '二维码内容（URL）',
    linkPlaceholder: 'https://u.wechat.com/xxxx',
    defaultName: '微信',
  },
  qq: {
    network: 'qq',
    label: 'QQ',
    type: 'qrcode',
    linkLabel: '二维码内容（URL）',
    linkPlaceholder: 'https://qm.qq.com/cgi-bin/qm/qr?...',
    defaultName: 'QQ',
  },
}

export function getSocialNetworkMeta(network: SocialNetwork): SocialNetworkMeta {
  return SOCIAL_NETWORK_META[network]
}
