import { CalendarIcon, ListChecksIcon, NetworkIcon, SearchIcon, UserIcon } from 'lucide-react'

import type { AuditLogActorDto } from '@/shared/contracts/audit'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { FilterFieldSpec, FilterOptionItem } from '@/ui/admin/shared/filter-bar/types'
import type { I18nValue } from '@/ui/lib/I18nProvider'

// Audit-log filter-pill specs. ACTION_OPTIONS / RESOURCE_TYPE_OPTIONS double
// as the row badge vocabularies (minus the synthetic 全部 entry).
export type AuditLogFilterFieldKey = 'action' | 'resourceType' | 'actor' | 'ip' | 'date'

/** The `admin.auditLog.list` / `exportCsv` input contributed by the active pills. */
export interface AuditFilterQuery {
  action?: string
  resourceType?: string
  actorId?: string
  ip?: string
  dateFrom?: string
  dateTo?: string
}

export const ACTION_OPTIONS: readonly { value: string; labelId: UiMessageId }[] = [
  { value: '', labelId: 'common.filter.all' },
  { value: 'login', labelId: 'admin.audit.action.login' },
  { value: 'logout', labelId: 'admin.audit.action.logout' },
  { value: 'password_reset_requested', labelId: 'admin.audit.action.password_reset_requested' },
  { value: 'password_reset_complete', labelId: 'admin.audit.action.password_reset_complete' },
  { value: 'password_changed', labelId: 'admin.audit.action.password_changed' },
  { value: 'password_reset_sent', labelId: 'admin.audit.action.password_reset_sent' },
  { value: 'session_revoked', labelId: 'admin.audit.action.session_revoked' },
  { value: 'user_soft_deleted', labelId: 'admin.audit.action.user_soft_deleted' },
  { value: 'user_restored', labelId: 'admin.audit.action.user_restored' },
  { value: 'user_updated', labelId: 'admin.audit.action.user_updated' },
  { value: 'user_muted', labelId: 'admin.audit.action.user_muted' },
  { value: 'user_unmuted', labelId: 'admin.audit.action.user_unmuted' },
  { value: 'user_role_changed', labelId: 'admin.audit.action.user_role_changed' },
  { value: 'author_invited', labelId: 'admin.audit.action.author_invited' },
  { value: 'author_invite_rolled_back', labelId: 'admin.audit.action.author_invite_rolled_back' },
  { value: 'post_deleted', labelId: 'admin.audit.action.post_deleted' },
  { value: 'post_restored', labelId: 'admin.audit.action.post_restored' },
  { value: 'post_unpublished', labelId: 'admin.audit.action.post_unpublished' },
  { value: 'post_draft_saved', labelId: 'admin.audit.action.post_draft_saved' },
  { value: 'post_published', labelId: 'admin.audit.action.post_published' },
  { value: 'post_meta_updated', labelId: 'admin.audit.action.post_meta_updated' },
  { value: 'post_created', labelId: 'admin.audit.action.post_created' },
  { value: 'page_deleted', labelId: 'admin.audit.action.page_deleted' },
  { value: 'page_restored', labelId: 'admin.audit.action.page_restored' },
  { value: 'page_unpublished', labelId: 'admin.audit.action.page_unpublished' },
  { value: 'page_draft_saved', labelId: 'admin.audit.action.page_draft_saved' },
  { value: 'page_published', labelId: 'admin.audit.action.page_published' },
  { value: 'page_meta_updated', labelId: 'admin.audit.action.page_meta_updated' },
  { value: 'page_created', labelId: 'admin.audit.action.page_created' },
  { value: 'comment_created', labelId: 'admin.audit.action.comment_created' },
  { value: 'comment_updated', labelId: 'admin.audit.action.comment_updated' },
  { value: 'comment_own_updated', labelId: 'admin.audit.action.comment_own_updated' },
  { value: 'comment_approved', labelId: 'admin.audit.action.comment_approved' },
  { value: 'comment_deleted', labelId: 'admin.audit.action.comment_deleted' },
  { value: 'comment_delete_request_approved', labelId: 'admin.audit.action.comment_delete_request_approved' },
  { value: 'comment_delete_request_rejected', labelId: 'admin.audit.action.comment_delete_request_rejected' },
  { value: 'comments_bulk_approved', labelId: 'admin.audit.action.comments_bulk_approved' },
  { value: 'comments_bulk_deleted', labelId: 'admin.audit.action.comments_bulk_deleted' },
  { value: 'webmention_approved', labelId: 'admin.audit.action.webmention_approved' },
  { value: 'webmention_rejected', labelId: 'admin.audit.action.webmention_rejected' },
  { value: 'settings_updated', labelId: 'admin.audit.action.settings_updated' },
  { value: 'system_updated', labelId: 'admin.audit.action.system_updated' },
  { value: 'friend_created', labelId: 'admin.audit.action.friend_created' },
  { value: 'friend_updated', labelId: 'admin.audit.action.friend_updated' },
  { value: 'friend_deleted', labelId: 'admin.audit.action.friend_deleted' },
  { value: 'category_created', labelId: 'admin.audit.action.category_created' },
  { value: 'category_updated', labelId: 'admin.audit.action.category_updated' },
  { value: 'category_deleted', labelId: 'admin.audit.action.category_deleted' },
  { value: 'categories_reordered', labelId: 'admin.audit.action.categories_reordered' },
  { value: 'tag_created', labelId: 'admin.audit.action.tag_created' },
  { value: 'tag_updated', labelId: 'admin.audit.action.tag_updated' },
  { value: 'tag_deleted', labelId: 'admin.audit.action.tag_deleted' },
  { value: 'image_uploaded', labelId: 'admin.audit.action.image_uploaded' },
  { value: 'image_deleted', labelId: 'admin.audit.action.image_deleted' },
  { value: 'image_note_updated', labelId: 'admin.audit.action.image_note_updated' },
  { value: 'music_added', labelId: 'admin.audit.action.music_added' },
  { value: 'music_updated', labelId: 'admin.audit.action.music_updated' },
  { value: 'music_deleted', labelId: 'admin.audit.action.music_deleted' },
  { value: 'backup_created', labelId: 'admin.audit.action.backup_created' },
  { value: 'backup_deleted', labelId: 'admin.audit.action.backup_deleted' },
  { value: 'backup_restored', labelId: 'admin.audit.action.backup_restored' },
  { value: 'branding_uploaded', labelId: 'admin.audit.action.branding_uploaded' },
  { value: 'branding_cleared', labelId: 'admin.audit.action.branding_cleared' },
  { value: 'audit_archive_run_failed', labelId: 'admin.audit.action.audit_archive_run_failed' },
  { value: 'cache_cleared', labelId: 'admin.audit.action.cache_cleared' },
  { value: 'search_reindexed', labelId: 'admin.audit.action.search_reindexed' },
  { value: 'body_projection_rebuilt', labelId: 'admin.audit.action.body_projection_rebuilt' },
  { value: 'test_mail_sent', labelId: 'admin.audit.action.test_mail_sent' },
  { value: 'search', labelId: 'admin.audit.action.search' },
  { value: 'audit_archive_run', labelId: 'admin.audit.action.audit_archive_run' },
  { value: 'setup_restored', labelId: 'admin.audit.action.setup_restored' },
  { value: 'otp_sent', labelId: 'admin.audit.action.otp_sent' },
  { value: 'otp_failed', labelId: 'admin.audit.action.otp_failed' },
  { value: 'magic_link_sent', labelId: 'admin.audit.action.magic_link_sent' },
  { value: 'login_method_changed', labelId: 'admin.audit.action.login_method_changed' },
  { value: 'passkeys_cleared', labelId: 'admin.audit.action.passkeys_cleared' },
  { value: 'passkey_registered', labelId: 'admin.audit.action.passkey_registered' },
  { value: 'passkey_deleted', labelId: 'admin.audit.action.passkey_deleted' },
  { value: 'maxmind_uploaded', labelId: 'admin.audit.action.maxmind_uploaded' },
  { value: 'maxmind_remote_updated', labelId: 'admin.audit.action.maxmind_remote_updated' },
  { value: 'font_uploaded', labelId: 'admin.audit.action.font_uploaded' },
  { value: 'font_deleted', labelId: 'admin.audit.action.font_deleted' },
  { value: 'font_slot_updated', labelId: 'admin.audit.action.font_slot_updated' },
]

export const RESOURCE_TYPE_OPTIONS: readonly { value: string; labelId: UiMessageId }[] = [
  { value: '', labelId: 'common.filter.all' },
  { value: 'user', labelId: 'admin.audit.resource.user' },
  { value: 'session', labelId: 'admin.audit.resource.session' },
  { value: 'post', labelId: 'admin.audit.resource.post' },
  { value: 'page', labelId: 'admin.audit.resource.page' },
  { value: 'comment', labelId: 'admin.audit.resource.comment' },
  { value: 'webmention', labelId: 'admin.audit.resource.webmention' },
  { value: 'setting', labelId: 'admin.audit.resource.setting' },
  { value: 'system', labelId: 'admin.audit.resource.system' },
  { value: 'friend', labelId: 'admin.audit.resource.friend' },
  { value: 'category', labelId: 'admin.audit.resource.category' },
  { value: 'tag', labelId: 'admin.audit.resource.tag' },
  { value: 'image', labelId: 'admin.audit.resource.image' },
  { value: 'music', labelId: 'admin.audit.resource.music' },
  { value: 'backup', labelId: 'admin.audit.resource.backup' },
  { value: 'cache', labelId: 'admin.audit.resource.cache' },
  { value: 'search', labelId: 'admin.audit.resource.search' },
  { value: 'mail', labelId: 'admin.audit.resource.mail' },
  { value: 'audit_log', labelId: 'admin.audit.resource.audit_log' },
  { value: 'branding', labelId: 'admin.audit.resource.branding' },
]

function renderActorOption(option: FilterOptionItem) {
  return (
    <>
      <UserIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{option.label}</span>
    </>
  )
}

export function buildAuditFilterFields(
  actors: AuditLogActorDto[],
  t: I18nValue['t'],
): FilterFieldSpec<AuditLogFilterFieldKey>[] {
  return [
    {
      key: 'action',
      label: t('admin.audit.filter.action'),
      icon: ListChecksIcon,
      kind: 'options',
      options: ACTION_OPTIONS.filter((o) => o.value !== '').map((o) => ({
        value: o.value,
        label: t(o.labelId),
      })),
      searchable: true,
      searchPlaceholder: t('admin.audit.filter.searchAction'),
      toQuery: (value) => (value ? { action: value } : {}),
    },
    {
      key: 'resourceType',
      label: t('admin.audit.filter.resourceType'),
      icon: SearchIcon,
      kind: 'options',
      options: RESOURCE_TYPE_OPTIONS.filter((o) => o.value !== '').map((o) => ({
        value: o.value,
        label: t(o.labelId),
      })),
      searchable: true,
      searchPlaceholder: t('admin.audit.filter.searchResource'),
      toQuery: (value) => (value ? { resourceType: value } : {}),
    },
    {
      key: 'actor',
      label: t('admin.audit.filter.actor'),
      icon: UserIcon,
      kind: 'options',
      options: actors.map((a) => ({ value: a.actorId, label: a.email || a.actorName || a.actorId })),
      searchable: true,
      searchPlaceholder: t('admin.audit.filter.searchActor'),
      searchEmptyMessage: t('admin.audit.filter.noActor'),
      renderOption: renderActorOption,
      toQuery: (value) => (value ? { actorId: value } : {}),
    },
    {
      key: 'ip',
      label: t('admin.audit.filter.ip'),
      icon: NetworkIcon,
      kind: 'freetext',
      placeholder: t('admin.audit.filter.ipPlaceholder'),
      toQuery: (value) => (value ? { ip: value } : {}),
    },
    {
      key: 'date',
      label: t('admin.audit.filter.date'),
      icon: CalendarIcon,
      kind: 'date-range',
      toQuery: ({ from, to }) => ({
        ...(from ? { dateFrom: from } : {}),
        ...(to ? { dateTo: to } : {}),
      }),
    },
  ]
}
