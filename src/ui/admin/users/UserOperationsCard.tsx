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
import { toast } from 'sonner'

import type { AdminUserDto } from '@/shared/contracts/users'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError, toastApiError } from '@/client/lib/toast-api-error'
import { ROLE_LABEL_KEYS } from '@/shared/utils/roles'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { useI18n } from '@/ui/lib/I18nProvider'

type Role = NonNullable<AdminUserDto['role']>

// Hoisted out of the click handlers so the callbacks create no JSX during render.
const REVOKE_SESSIONS_ICON = <LogOutIcon data-icon />
const CLEAR_PASSKEYS_ICON = <FingerprintIcon data-icon />
const UNMUTE_ICON = <Volume2Icon data-icon />
const MUTE_ICON = <VolumeOffIcon data-icon />

interface UserOperationsCardProps {
  user: AdminUserDto
  currentUserId: string
  passkeyEnabled: boolean
  /** Called after the user is soft-deleted (the parent navigates away). */
  onDeleted: () => void
}

export function UserOperationsCard({ user, currentUserId, passkeyEnabled, onDeleted }: UserOperationsCardProps) {
  const queryClient = useQueryClient()
  const { t } = useI18n()

  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [roleDraft, setRoleDraft] = useState<Role | ''>('')

  const updateRoleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: Role }) =>
      orpc.admin.users.updateRole({ id: vars.userId, role: vars.role }),
    onSuccess: () => {
      setRoleDraft('')
      invalidateUsersCache(queryClient)
      toast.success(t('admin.users.ops.roleChanged'))
    },
    onError: (error) => {
      setRoleDraft('')
      toastApiError(error, 'admin.toast.roleChangeFailed', t)
    },
  })

  const sendResetMutation = useMutation({
    ...orpcQuery.admin.users.sendPasswordReset.mutationOptions(),
    onSuccess: () => {
      toast.success(t('admin.users.ops.resetSent'))
    },
    onError: onMutationError('admin.toast.resetEmailFailed', t),
  })

  const revokeSessionsMutation = useMutation({
    ...orpcQuery.admin.users.revokeAllSessions.mutationOptions(),
    onSuccess: () => {
      toast.success(t('admin.users.ops.revoked'))
    },
    onError: onMutationError('admin.toast.forceSignOutFailed', t),
  })

  const clearPasskeysMutation = useMutation({
    mutationFn: (vars: { userId: string }) => orpc.admin.users.clearPasskeys({ id: vars.userId }),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      toast.success(t('admin.users.ops.passkeysCleared'))
    },
    onError: onMutationError('admin.toast.passkeyClearFailed', t),
  })

  const muteMutation = useMutation({
    mutationFn: (vars: { userId: string; muted: boolean }) =>
      orpc.admin.users.mute({ id: vars.userId, muted: vars.muted }),
    onSuccess: (_result, vars) => {
      invalidateUsersCache(queryClient)
      toast.success(vars.muted ? t('admin.users.ops.muted') : t('admin.users.ops.unmuted'))
    },
    onError: onMutationError('admin.toast.muteFailed', t),
  })

  const bulkApproveMutation = useMutation({
    ...orpcQuery.admin.users.bulkApproveComments.mutationOptions(),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.comments.loadAll.key() })
      toast.success(t('admin.users.ops.approvedAll'))
    },
    onError: onMutationError('admin.toast.batchApproveFailed', t),
  })

  const deleteMutation = useMutation({
    mutationFn: (vars: { userId: string }) => orpc.admin.users.softDelete({ id: vars.userId }),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      onDeleted()
    },
    onError: onMutationError('admin.toast.userDeleteFailed', t),
  })

  const restoreMutation = useMutation({
    mutationFn: (vars: { userId: string }) => orpc.admin.users.restore({ id: vars.userId, ...vars }),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      toast.success(t('admin.users.ops.restored'))
    },
    onError: onMutationError('admin.toast.userRestoreFailed', t),
  })

  const bulkDeleteMutation = useMutation({
    ...orpcQuery.admin.users.bulkDeleteComments.mutationOptions(),
    onSuccess: () => {
      invalidateUsersCache(queryClient)
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.comments.loadAll.key() })
      toast.success(t('admin.users.ops.commentsDeleted'))
    },
    onError: onMutationError('admin.toast.batchCommentDeleteFailed', t),
  })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.users.ops.title')}</CardTitle>
          <CardDescription>{t('admin.users.ops.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {user.id !== currentUserId && user.role !== null && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="user-role">{t('admin.users.ops.role')}</Label>
              <Select
                items={[
                  { value: 'admin', label: t(ROLE_LABEL_KEYS.admin) },
                  { value: 'author', label: t(ROLE_LABEL_KEYS.author) },
                  { value: 'visitor', label: t(ROLE_LABEL_KEYS.visitor) },
                ]}
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
                    title: t('admin.users.ops.changeRoleTitle', { role: t(ROLE_LABEL_KEYS[nextRole]) }),
                    description: t('admin.users.ops.changeRoleBody'),
                    actionLabel: t('admin.users.ops.changeRoleConfirm'),
                    destructive: false,
                    onConfirm: () => updateRoleMutation.mutate({ userId: user.id, role: nextRole }),
                  })
                }}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t(ROLE_LABEL_KEYS.admin)}</SelectItem>
                  <SelectItem value="author">{t(ROLE_LABEL_KEYS.author)}</SelectItem>
                  <SelectItem value="visitor">{t(ROLE_LABEL_KEYS.visitor)}</SelectItem>
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
                  title: t('admin.users.ops.resetTitle', { name: user.name }),
                  description: t('admin.users.ops.resetBody'),
                  actionLabel: t('admin.users.ops.resetSend'),
                  destructive: false,
                  onConfirm: () => sendResetMutation.mutate({ email: user.email }),
                })
              }
            >
              <MailIcon /> {t('admin.users.ops.reset')}
            </Button>
          )}
          {user.role !== null && user.deletedAt === null && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: t('admin.users.ops.revokeTitle', { name: user.name }),
                  description: t('admin.users.ops.revokeBody'),
                  actionLabel: t('admin.users.ops.revokeConfirm'),
                  destructive: true,
                  actionIcon: REVOKE_SESSIONS_ICON,
                  onConfirm: () => revokeSessionsMutation.mutate({ userId: user.id }),
                })
              }
            >
              <LogOutIcon /> {t('admin.users.ops.revoke')}
            </Button>
          )}
          {passkeyEnabled && user.role !== null && user.deletedAt === null && user.passkeyCount > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: t('admin.users.ops.clearPasskeysTitle', { name: user.name }),
                  description: t('admin.users.ops.clearPasskeysBody'),
                  actionLabel: t('admin.users.ops.clearPasskeysConfirm'),
                  destructive: true,
                  actionIcon: CLEAR_PASSKEYS_ICON,
                  onConfirm: () => clearPasskeysMutation.mutate({ userId: user.id }),
                })
              }
            >
              <FingerprintIcon /> {t('admin.users.ops.clearPasskeys', { count: user.passkeyCount })}
            </Button>
          )}
          {user.role !== 'admin' && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: user.isMuted ? t('admin.users.ops.unmuteTitle') : t('admin.users.ops.muteTitle'),
                  description: user.isMuted ? t('admin.users.ops.unmuteBody') : t('admin.users.ops.muteBody'),
                  actionLabel: user.isMuted ? t('admin.users.ops.unmute') : t('admin.users.ops.mute'),
                  destructive: !user.isMuted,
                  actionIcon: user.isMuted ? UNMUTE_ICON : MUTE_ICON,
                  onConfirm: () => muteMutation.mutate({ userId: user.id, muted: !user.isMuted }),
                })
              }
            >
              {user.isMuted ? (
                <>
                  <Volume2Icon /> {t('admin.users.ops.unmuteAction')}
                </>
              ) : (
                <>
                  <VolumeOffIcon /> {t('admin.users.ops.mute')}
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
                  title: t('admin.users.ops.approveAllTitle', { count: user.pendingCount }),
                  description: t('admin.users.ops.approveAllBody'),
                  actionLabel: t('admin.users.ops.approveConfirm'),
                  destructive: false,
                  onConfirm: () => bulkApproveMutation.mutate({ userId: user.id }),
                })
              }
            >
              <CheckCheckIcon /> {t('admin.users.ops.approveAll', { count: user.pendingCount })}
            </Button>
          )}
          {user.deletedAt ? (
            <Button type="button" variant="outline" onClick={() => restoreMutation.mutate({ userId: user.id })}>
              <RotateCcwIcon /> {t('admin.users.ops.restore')}
            </Button>
          ) : (
            user.role !== 'admin' && (
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  setConfirm({
                    title: t('admin.users.ops.deleteTitle'),
                    description: t('admin.users.ops.deleteBody'),
                    actionLabel: t('common.action.delete'),
                    destructive: true,
                    onConfirm: () => deleteMutation.mutate({ userId: user.id }),
                  })
                }
              >
                <Trash2Icon /> {t('admin.users.ops.softDelete')}
              </Button>
            )
          )}
          {user.commentCount > 0 && user.role !== 'admin' && (
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                setConfirm({
                  title: t('admin.users.ops.deleteCommentsTitle'),
                  description: t('admin.users.ops.deleteCommentsBody'),
                  actionLabel: t('common.action.delete'),
                  destructive: true,
                  onConfirm: () => bulkDeleteMutation.mutate({ userId: user.id }),
                })
              }
            >
              <Trash2Icon /> {t('admin.users.ops.deleteComments')}
            </Button>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
