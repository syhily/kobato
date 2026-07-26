// The closed list of "branded" social network identifiers used by the
// `socials[]` settings array. Header maps each value to a fixed icon, and
// the admin SocialsEditor uses the list to populate its "add a platform"
// menu.
//
// Lives in `@/shared/` because both the server-side Zod schema and the
// admin form editor need the same canonical list, while UI modules are
// forbidden from importing server modules and shared modules cannot
// import from server.
export const SOCIAL_NETWORKS = ['github', 'x', 'wechat', 'weibo', 'qq'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export type SocialDisplayType = 'link' | 'qrcode'

// Canonical per-platform metadata. The admin editor uses these to:
//   - render the "add a platform" menu (label, fixed display type),
//   - decide whether the row needs a URL input or a QR-code title input,
//   - seed the user-visible name (`socials[].name`) so an editor never
//     has to type it.
//
// `linkPlaceholder` is a hint string (not validation) showing the
// expected URL shape for that network.
export interface SocialNetworkMeta {
  network: SocialNetwork
  label: string
  type: SocialDisplayType
  linkLabel: string
  linkPlaceholder: string
  /**
   * Default text shown in the QR-code popup subtitle (`socials[].name`).
   * Editors can override per-row inside the form when they want to
   * personalise the popup wording (e.g. "Yufan Sheng" instead of "微信").
   */
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
