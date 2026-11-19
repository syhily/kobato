import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { SocialNetwork } from '@kobato/settings/socials.ts'
import type { FooterNavItem } from '@kobato/settings/types.ts'

import { SOCIAL_NETWORKS } from '@kobato/settings/socials.ts'

export interface SideNavRow {
  clientId: string
  text: string
  link: string
  newTab: boolean
}

export interface FooterNavItemRowState extends FooterNavItem {
  clientId: string
}

export const TYPE_LABEL_IDS = {
  social: 'admin.settings.navigation.type.social',
  themeToggle: 'admin.settings.navigation.type.themeToggle',
  search: 'admin.settings.navigation.type.search',
} as const satisfies Record<FooterNavItem['type'], UiMessageId>

const FOOTER_NAV_TYPE_SET: ReadonlySet<string> = new Set(['social', 'themeToggle', 'search'])
const SOCIAL_NETWORK_SET: ReadonlySet<string> = new Set(SOCIAL_NETWORKS)

function isFooterNavType(value: string): value is FooterNavItem['type'] {
  return FOOTER_NAV_TYPE_SET.has(value)
}

function isSocialNetwork(value: string): value is SocialNetwork {
  return SOCIAL_NETWORK_SET.has(value)
}

export function asFooterNavType(value: string | null): FooterNavItem['type'] {
  return value !== null && isFooterNavType(value) ? value : 'social'
}

export function asSocialNetwork(value: string | null): SocialNetwork {
  return value !== null && isSocialNetwork(value) ? value : 'github'
}
