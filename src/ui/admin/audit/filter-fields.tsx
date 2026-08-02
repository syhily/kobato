import { CalendarIcon, ListChecksIcon, NetworkIcon, SearchIcon, UserIcon } from 'lucide-react'

import type { AuditLogActorDto } from '@/shared/contracts/audit'
import type { FilterFieldSpec, FilterOptionItem } from '@/ui/admin/shared/filter-bar/types'

// Audit-log filter-pill field specs. ACTION_OPTIONS / RESOURCE_TYPE_OPTIONS
// double as the row badge vocabularies (AuditLogRow imports them here) —
// the filter dropdowns use the same lists minus the synthetic 全部 entry.
//
// `buildAuditFilterFields` is a factory (memoized by the view) because the
// actor options come from the async actors query. The actor rows keep their
// icon + truncated-label rendering via `renderOption`.

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

export const ACTION_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'login', label: '登录' },
  { value: 'logout', label: '登出' },
  { value: 'password_reset_requested', label: '密码重置请求' },
  { value: 'password_reset_complete', label: '密码重置完成' },
  { value: 'password_changed', label: '密码修改' },
  { value: 'password_reset_sent', label: '密码重置邮件已发送' },
  { value: 'session_revoked', label: '会话撤销' },
  { value: 'user_soft_deleted', label: '用户软删除' },
  { value: 'user_restored', label: '用户恢复' },
  { value: 'user_updated', label: '用户更新' },
  { value: 'user_muted', label: '用户禁言' },
  { value: 'user_unmuted', label: '用户解除禁言' },
  { value: 'user_role_changed', label: '用户角色变更' },
  { value: 'author_invited', label: '作者邀请' },
  { value: 'author_invite_rolled_back', label: '作者邀请回滚' },
  { value: 'post_deleted', label: '文章删除' },
  { value: 'post_restored', label: '文章恢复' },
  { value: 'post_unpublished', label: '文章取消发布' },
  { value: 'post_draft_saved', label: '文章草稿保存' },
  { value: 'post_published', label: '文章发布' },
  { value: 'post_meta_updated', label: '文章元数据更新' },
  { value: 'post_created', label: '文章创建' },
  { value: 'page_deleted', label: '页面删除' },
  { value: 'page_restored', label: '页面恢复' },
  { value: 'page_unpublished', label: '页面取消发布' },
  { value: 'page_draft_saved', label: '页面草稿保存' },
  { value: 'page_published', label: '页面发布' },
  { value: 'page_meta_updated', label: '页面元数据更新' },
  { value: 'page_created', label: '页面创建' },
  { value: 'comment_created', label: '评论创建' },
  { value: 'comment_updated', label: '评论更新' },
  { value: 'comment_own_updated', label: '评论更新（本人）' },
  { value: 'comment_approved', label: '评论审核通过' },
  { value: 'comment_deleted', label: '评论删除' },
  { value: 'comment_delete_request_approved', label: '评论删除请求通过' },
  { value: 'comment_delete_request_rejected', label: '评论删除请求拒绝' },
  { value: 'comments_bulk_approved', label: '评论批量审核通过' },
  { value: 'comments_bulk_deleted', label: '评论批量删除' },
  { value: 'webmention_approved', label: 'Webmention 审核通过' },
  { value: 'webmention_rejected', label: 'Webmention 拒绝' },
  { value: 'settings_updated', label: '设置更新' },
  { value: 'system_updated', label: '系统更新' },
  { value: 'friend_created', label: '友链创建' },
  { value: 'friend_updated', label: '友链更新' },
  { value: 'friend_deleted', label: '友链删除' },
  { value: 'category_created', label: '分类创建' },
  { value: 'category_updated', label: '分类更新' },
  { value: 'category_deleted', label: '分类删除' },
  { value: 'categories_reordered', label: '分类重新排序' },
  { value: 'tag_created', label: '标签创建' },
  { value: 'tag_updated', label: '标签更新' },
  { value: 'tag_deleted', label: '标签删除' },
  { value: 'image_uploaded', label: '图片上传' },
  { value: 'image_deleted', label: '图片删除' },
  { value: 'image_note_updated', label: '图片备注更新' },
  { value: 'music_added', label: '音乐添加' },
  { value: 'music_updated', label: '音乐更新' },
  { value: 'music_deleted', label: '音乐删除' },
  { value: 'backup_created', label: '备份创建' },
  { value: 'backup_deleted', label: '备份删除' },
  { value: 'backup_restored', label: '备份恢复' },
  { value: 'branding_uploaded', label: '品牌素材上传' },
  { value: 'branding_cleared', label: '品牌素材清除' },
  { value: 'audit_archive_run_failed', label: '审计归档执行失败' },
  { value: 'cache_cleared', label: '缓存清除' },
  { value: 'search_reindexed', label: '搜索重建索引' },
  { value: 'test_mail_sent', label: '测试邮件发送' },
  { value: 'search', label: '搜索' },
  { value: 'audit_archive_run', label: '审计归档执行' },
  { value: 'setup_restored', label: '初始设置恢复' },
  { value: 'otp_sent', label: '验证码已发送' },
  { value: 'otp_failed', label: '验证码验证失败' },
  { value: 'magic_link_sent', label: '登录链接已发送' },
  { value: 'login_method_changed', label: '登陆方式变更' },
  { value: 'passkeys_cleared', label: '通行密钥清空' },
  { value: 'passkey_registered', label: '通行密钥注册' },
  { value: 'passkey_deleted', label: '通行密钥删除' },
  { value: 'maxmind_uploaded', label: 'MaxMind 数据上传' },
  { value: 'maxmind_remote_updated', label: 'MaxMind 远程更新' },
  { value: 'font_uploaded', label: '字体上传' },
  { value: 'font_deleted', label: '字体删除' },
  { value: 'font_slot_updated', label: '字体槽位更新' },
]

export const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'user', label: '用户' },
  { value: 'session', label: '会话' },
  { value: 'post', label: '文章' },
  { value: 'page', label: '页面' },
  { value: 'comment', label: '评论' },
  { value: 'webmention', label: 'Webmention' },
  { value: 'setting', label: '设置' },
  { value: 'system', label: '系统' },
  { value: 'friend', label: '友链' },
  { value: 'category', label: '分类' },
  { value: 'tag', label: '标签' },
  { value: 'image', label: '图片' },
  { value: 'music', label: '音乐' },
  { value: 'backup', label: '备份' },
  { value: 'cache', label: '缓存' },
  { value: 'search', label: '搜索' },
  { value: 'mail', label: '邮件' },
  { value: 'audit_log', label: '审计日志' },
  { value: 'branding', label: '品牌素材' },
]

function renderActorOption(option: FilterOptionItem) {
  return (
    <>
      <UserIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{option.label}</span>
    </>
  )
}

export function buildAuditFilterFields(actors: AuditLogActorDto[]): FilterFieldSpec<AuditLogFilterFieldKey>[] {
  return [
    {
      key: 'action',
      label: '操作类型',
      icon: ListChecksIcon,
      kind: 'options',
      options: ACTION_OPTIONS.filter((o) => o.value !== ''),
      searchable: true,
      searchPlaceholder: '搜索操作类型…',
      toQuery: (value) => (value ? { action: value } : {}),
    },
    {
      key: 'resourceType',
      label: '资源类型',
      icon: SearchIcon,
      kind: 'options',
      options: RESOURCE_TYPE_OPTIONS.filter((o) => o.value !== ''),
      searchable: true,
      searchPlaceholder: '搜索资源类型…',
      toQuery: (value) => (value ? { resourceType: value } : {}),
    },
    {
      key: 'actor',
      label: '操作人',
      icon: UserIcon,
      kind: 'options',
      options: actors.map((a) => ({ value: a.actorId, label: a.email || a.actorName || a.actorId })),
      searchable: true,
      searchPlaceholder: '搜索邮箱、姓名或 ID',
      searchEmptyMessage: '无匹配操作人',
      renderOption: renderActorOption,
      toQuery: (value) => (value ? { actorId: value } : {}),
    },
    {
      key: 'ip',
      label: 'IP',
      icon: NetworkIcon,
      kind: 'freetext',
      placeholder: '输入 IP 或片段',
      toQuery: (value) => (value ? { ip: value } : {}),
    },
    {
      key: 'date',
      label: '时间',
      icon: CalendarIcon,
      kind: 'date-range',
      toQuery: ({ from, to }) => ({
        ...(from ? { dateFrom: from } : {}),
        ...(to ? { dateTo: to } : {}),
      }),
    },
  ]
}
