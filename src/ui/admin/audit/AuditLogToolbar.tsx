import { DownloadIcon, RotateCcwIcon, XIcon } from 'lucide-react'

import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { DateRangePicker } from '@/ui/admin/shared/DateRangePicker'
import { Button } from '@/ui/components/button'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'

interface AuditLogToolbarProps {
  action: string
  resourceType: string
  actorEmail: string
  dateFrom: string
  dateTo: string
  actorEmails: string[]
  onActionChange: (value: string) => void
  onResourceTypeChange: (value: string) => void
  onActorEmailChange: (value: string) => void
  onDateRangeChange: (from: string, to: string) => void
  onReset: () => void
  onExport: () => void
  isExporting: boolean
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
  { value: 'settings_updated', label: '设置更新' },
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
]

export const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'user', label: '用户' },
  { value: 'session', label: '会话' },
  { value: 'post', label: '文章' },
  { value: 'page', label: '页面' },
  { value: 'comment', label: '评论' },
  { value: 'setting', label: '设置' },
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

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="destructive-soft"
      size="sm"
      onClick={onClick}
      className="h-7 gap-1 px-2 py-0 text-xs"
    >
      <XIcon data-icon="sm" />
      清除
    </Button>
  )
}

export function AuditLogToolbar({
  action,
  resourceType,
  actorEmail,
  dateFrom,
  dateTo,
  actorEmails,
  onActionChange,
  onResourceTypeChange,
  onActorEmailChange,
  onDateRangeChange,
  onReset,
  onExport,
  isExporting,
}: AuditLogToolbarProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminListPage.FilterField
          label="操作类型"
          action={action ? <ClearButton onClick={() => onActionChange('')} /> : undefined}
        >
          <Combobox
            items={ACTION_OPTIONS.map((a) => a.label)}
            value={ACTION_OPTIONS.find((a) => a.value === action)?.label ?? ''}
            onValueChange={(label) => {
              const option = ACTION_OPTIONS.find((a) => a.label === label)
              onActionChange(option?.value ?? '')
            }}
          >
            <ComboboxTrigger className="w-full">
              <ComboboxValue placeholder="全部" />
            </ComboboxTrigger>
            <ComboboxContent<string> inputPlaceholder="搜索操作类型…" emptyMessage="无匹配操作类型">
              {(label) => (
                <ComboboxItem key={label} value={label}>
                  {label}
                </ComboboxItem>
              )}
            </ComboboxContent>
          </Combobox>
        </AdminListPage.FilterField>

        <AdminListPage.FilterField
          label="资源类型"
          action={resourceType ? <ClearButton onClick={() => onResourceTypeChange('')} /> : undefined}
        >
          <Combobox
            items={RESOURCE_TYPE_OPTIONS.map((r) => r.label)}
            value={RESOURCE_TYPE_OPTIONS.find((r) => r.value === resourceType)?.label ?? ''}
            onValueChange={(label) => {
              const option = RESOURCE_TYPE_OPTIONS.find((r) => r.label === label)
              onResourceTypeChange(option?.value ?? '')
            }}
          >
            <ComboboxTrigger className="w-full">
              <ComboboxValue placeholder="全部" />
            </ComboboxTrigger>
            <ComboboxContent<string> inputPlaceholder="搜索资源类型…" emptyMessage="无匹配资源类型">
              {(label) => (
                <ComboboxItem key={label} value={label}>
                  {label}
                </ComboboxItem>
              )}
            </ComboboxContent>
          </Combobox>
        </AdminListPage.FilterField>

        <AdminListPage.FilterField
          label="用户邮箱"
          action={actorEmail ? <ClearButton onClick={() => onActorEmailChange('')} /> : undefined}
        >
          <Combobox items={actorEmails} value={actorEmail} onValueChange={(value) => onActorEmailChange(value ?? '')}>
            <ComboboxTrigger className="w-full">
              <ComboboxValue placeholder="全部用户" />
            </ComboboxTrigger>
            <ComboboxContent<string> inputPlaceholder="搜索用户邮箱…" emptyMessage="无匹配用户">
              {(email) => (
                <ComboboxItem key={email} value={email}>
                  {email}
                </ComboboxItem>
              )}
            </ComboboxContent>
          </Combobox>
        </AdminListPage.FilterField>

        <AdminListPage.FilterField
          label="日期范围"
          action={dateFrom || dateTo ? <ClearButton onClick={() => onDateRangeChange('', '')} /> : undefined}
        >
          <DateRangePicker from={dateFrom} to={dateTo} onChange={onDateRangeChange} />
        </AdminListPage.FilterField>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          <RotateCcwIcon data-icon className="mr-1" />
          重置筛选
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onExport} disabled={isExporting}>
          <DownloadIcon data-icon className="mr-1" />
          {isExporting ? '导出中…' : '导出 CSV'}
        </Button>
      </div>
    </div>
  )
}
