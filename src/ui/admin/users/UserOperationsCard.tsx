import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCheckIcon,
  FingerprintIcon,
  LogOutIcon,
  MailIcon,
  RotateCcwIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeOffIcon,
} from 'lucide-react'
import { useState } from 'react'

import type { AdminUserDto } from '@/shared/contracts/users'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

type Role = NonNullable<AdminUserDto['role']>

interface UserOperationsCardProps {
  user: AdminUserDto
  currentUserId: string
  passkeyEnabled: boolean
  /** Called after the user is soft-deleted (the parent navigates away). */
  onDeleted: () => void
}

export function UserOperationsCard({ user, currentUserId, passkeyEnabled, onDeleted }: UserOperationsCardProps) {
  const queryClient = useQueryClient()

  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [roleDraft, setRoleDraft] = useState<Role | ''>('')

  const updateRoleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: Role }) =>
      orpc.admin.users.updateRole({ id: vars.userId, role: vars.role }),
    onSuccess: () => {
      setRoleDraft('')
      invalidateUsersCache(queryClient)
    },
  })

  const sendResetMutation = useMutation({
    ...orpcQuery.admin.users.sendPasswordReset.mutationOptions(),
  })

  const revokeSessionsMutation = useMutation({
    ...orpcQuery.admin.users.revokeAllSessions.mutationOptions(),
  })

  const clearPasskeysMutation = useMutation({
    mutationFn: (vars: { userId: string }) => orpc.admin.users.clearPasskeys({ id: vars.userId }),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
    },
  })

  const muteMutation = useMutation({
    mutationFn: (vars: { userId: string; muted: boolean }) =>
      orpc.admin.users.mute({ id: vars.userId, muted: vars.muted }),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
    },
  })

  const bulkApproveMutation = useMutation({
    ...orpcQuery.admin.users.bulkApproveComments.mutationOptions(),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.comments.loadAll.key() })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (vars: { userId: string }) => orpc.admin.users.softDelete({ id: vars.userId }),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      onDeleted()
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (vars: { userId: string }) => orpc.admin.users.restore({ id: vars.userId, ...vars }),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
    },
  })

  const bulkDeleteMutation = useMutation({
    ...orpcQuery.admin.users.bulkDeleteComments.mutationOptions(),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.comments.loadAll.key() })
    },
  })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>操作</CardTitle>
          <CardDescription>对该用户执行管理操作。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {user.id !== currentUserId && user.role !== null && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="user-role">角色</Label>
              <Select
                value={roleDraft || user.role}
                onValueChange={(value) => {
                  if (value === user.role) {
                    setRoleDraft('')
                    return
                  }
                  const nextRole: Role | '' =
                    value === 'admin' || value === 'author' || value === 'visitor' ? value : ''
                  if (nextRole === '') {
                    return
                  }
                  setRoleDraft(nextRole)
                  setConfirm({
                    title: `修改角色为「${nextRole === 'admin' ? '管理员' : nextRole === 'author' ? '作者' : '访客'}」？`,
                    description: '修改角色后，该用户的所有会话将被强制登出。',
                    actionLabel: '确认修改',
                    destructive: false,
                    onConfirm: () => updateRoleMutation.mutate({ userId: user.id, role: nextRole }),
                  })
                }}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="author">作者</SelectItem>
                  <SelectItem value="visitor">访客</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {user.role !== null && user.deletedAt === null && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: `发送重置邮件给 ${user.name}？`,
                  description: '用户将收到一封包含一次性重置链接的邮件。链接 15 分钟内有效。',
                  actionLabel: '发送',
                  destructive: false,
                  onConfirm: () => sendResetMutation.mutate({ email: user.email }),
                })
              }
            >
              <MailIcon /> 发送重置邮件
            </Button>
          )}
          {user.role !== null && user.deletedAt === null && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: `强制 ${user.name} 全部登出？`,
                  description: '该用户在所有设备上的登录会话将立即被注销，下次访问需要重新登录。',
                  actionLabel: '强制登出',
                  destructive: true,
                  actionIcon: <LogOutIcon data-icon />,
                  onConfirm: () => revokeSessionsMutation.mutate({ userId: user.id }),
                })
              }
            >
              <LogOutIcon /> 强制全部登出
            </Button>
          )}
          {passkeyEnabled && user.role !== null && user.deletedAt === null && user.passkeyCount > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: `清除 ${user.name} 的 Passkey？`,
                  description: '清除后该用户的所有 Passkey 将被删除，登陆方式将重置为密码登陆。',
                  actionLabel: '清除',
                  destructive: true,
                  actionIcon: <FingerprintIcon data-icon />,
                  onConfirm: () => clearPasskeysMutation.mutate({ userId: user.id }),
                })
              }
            >
              <FingerprintIcon /> 清除 Passkey ({user.passkeyCount})
            </Button>
          )}
          {user.role !== 'admin' && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: user.isMuted ? '解除禁言？' : '禁言该用户？',
                  description: user.isMuted
                    ? '解除后该用户可以继续在站点发表评论。'
                    : '禁言后该用户无法再发表新的评论，但已有评论保持可见。',
                  actionLabel: user.isMuted ? '解除' : '禁言',
                  destructive: !user.isMuted,
                  actionIcon: user.isMuted ? <Volume2Icon data-icon /> : <VolumeOffIcon data-icon />,
                  onConfirm: () => muteMutation.mutate({ userId: user.id, muted: !user.isMuted }),
                })
              }
            >
              {user.isMuted ? (
                <>
                  <Volume2Icon /> 解除禁言
                </>
              ) : (
                <>
                  <VolumeOffIcon /> 禁言
                </>
              )}
            </Button>
          )}
          {user.pendingCount > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: `审核全部 ${user.pendingCount} 条待审评论？`,
                  description: '所有待审核评论将立即通过审核并对所有访客可见。',
                  actionLabel: '通过',
                  destructive: false,
                  onConfirm: () => bulkApproveMutation.mutate({ userId: user.id }),
                })
              }
            >
              <CheckCheckIcon /> 通过全部待审 ({user.pendingCount})
            </Button>
          )}
          {user.deletedAt ? (
            <Button type="button" variant="outline" onClick={() => restoreMutation.mutate({ userId: user.id })}>
              <RotateCcwIcon /> 恢复用户
            </Button>
          ) : (
            user.role !== 'admin' && (
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  setConfirm({
                    title: '软删除该用户？',
                    description: '此操作为软删除，用户记录保留，但在统计与列表中默认隐藏。',
                    actionLabel: '删除',
                    destructive: true,
                    onConfirm: () => deleteMutation.mutate({ userId: user.id }),
                  })
                }
              >
                <Trash2Icon /> 软删除用户
              </Button>
            )
          )}
          {user.commentCount > 0 && user.role !== 'admin' && (
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                setConfirm({
                  title: '删除该用户全部评论？',
                  description: '此操作为软删除，可后续通过数据库恢复。',
                  actionLabel: '删除',
                  destructive: true,
                  onConfirm: () => bulkDeleteMutation.mutate({ userId: user.id }),
                })
              }
            >
              <Trash2Icon /> 删除其全部评论
            </Button>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
