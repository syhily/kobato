import type { AvatarSource } from '@kobato/assets/avatar'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { CommentsLoaderShape } from '@kobato/settings/projection'

export interface CommentsFormProps {
  comments: CommentsLoaderShape
}

export const AVATAR_SOURCE_LABEL_IDS = {
  qq: 'admin.settings.comments.avatar.source.qq',
  github: 'admin.settings.comments.avatar.source.github',
  gravatar: 'admin.settings.comments.avatar.source.gravatar',
} as const satisfies Record<AvatarSource, UiMessageId>

export interface AvatarCardState {
  sources: AvatarSource[]
  avatarMirror: string
  githubToken: string
}
