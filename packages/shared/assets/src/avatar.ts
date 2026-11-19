export const DEFAULT_AVATAR_SIZE = 120

export const AVATAR_SOURCES = ['qq', 'github', 'gravatar'] as const

export type AvatarSource = (typeof AVATAR_SOURCES)[number]

export function avatarImageUrl(id: string | number, size: number = DEFAULT_AVATAR_SIZE): string {
  return `/images/avatar/${id}.png?s=${size}`
}
