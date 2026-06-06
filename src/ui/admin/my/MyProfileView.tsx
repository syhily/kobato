import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser'

import { startRegistration } from '@simplewebauthn/browser'
import { EyeIcon, EyeOffIcon, FingerprintIcon, KeyRoundIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRevalidator } from 'react-router'

import { useMutation, orpcQuery, useQuery, useQueryClient } from '@/client/api/query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { roleLabel } from '@/shared/utils/roles'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Separator } from '@/ui/components/separator'
import { Switch } from '@/ui/components/switch'
import { maskIp, maskUa } from '@/ui/lib/mask'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

export interface MyProfileUser {
  id: string
  name: string
  email: string
  link: string
  role: 'admin' | 'author' | 'visitor' | null
  badgeName: string
  badgeColor: string
  createdAt: string | null
  lastIp: string | null
  lastUa: string | null
  passkeyForce: boolean
}

export interface MyProfileCounts {
  total: number
  pending: number
  deleteRequested: number
}

export interface MyProfileViewProps {
  user: MyProfileUser
  counts: MyProfileCounts
}

function usePasskeyManagement(_userId: string, revalidator: ReturnType<typeof useRevalidator>) {
  const queryClient = useQueryClient()
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerMessage, setRegisterMessage] = useState<string | null>(null)

  const passkeyQuery = useQuery(orpcQuery.account.passkeyList.queryOptions())
  const credentials = passkeyQuery.data?.credentials ?? []

  const registerBeginMutation = useMutation({
    ...orpcQuery.account.passkeyRegisterBegin.mutationOptions(),
  })
  const registerFinishMutation = useMutation({
    ...orpcQuery.account.passkeyRegisterFinish.mutationOptions(),
    onSuccess: () => {
      setRegisterMessage('Passkey registered successfully.')
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
    },
  })
  const deleteMutation = useMutation({
    ...orpcQuery.account.passkeyDelete.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
    },
  })
  const setForceMutation = useMutation({
    ...orpcQuery.account.passkeySetForce.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
      void revalidator.revalidate()
    },
  })

  const handleRegister = async (deviceName?: string) => {
    setRegisterError(null)
    setRegisterMessage(null)
    try {
      const { options } = await registerBeginMutation.mutateAsync({ deviceName })
      const opts = options as PublicKeyCredentialCreationOptionsJSON
      const response = await startRegistration({ optionsJSON: opts })
      await registerFinishMutation.mutateAsync({
        response: response as RegistrationResponseJSON,
        deviceName,
        challenge: opts.challenge,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey 注册失败，请重试。'
      setRegisterError(message)
    }
  }

  const handleDelete = (credentialId: string) => {
    deleteMutation.mutate({ credentialId })
  }

  return {
    credentials,
    isLoading: passkeyQuery.isPending,
    registerError,
    registerMessage,
    handleRegister,
    handleDelete,
    setForceMutation,
    deletePending: deleteMutation.isPending,
    registerPending: registerBeginMutation.isPending || registerFinishMutation.isPending,
  }
}

export function MyProfileView({ user, counts }: MyProfileViewProps) {
  const config = useSiteIdentity()
  const revalidator = useRevalidator()

  const profileMutation = useMutation({
    ...orpcQuery.account.updateProfile.mutationOptions(),
    onSuccess: () => {
      setProfileMessage('已保存。')
      // Re-run the route loader so the avatar / stats card picks up
      // any name change without a full reload.
      void revalidator.revalidate()
    },
  })
  const passwordMutation = useMutation({
    ...orpcQuery.account.updatePassword.mutationOptions(),
    onSuccess: () => {
      setPasswordMessage('密码已更新；其他设备的会话已注销。')
      setOldPassword('')
      setNewPassword('')
    },
  })

  const [name, setName] = useState(user.name)
  const [link, setLink] = useState(user.link)
  const [badgeName, setBadgeName] = useState(user.badgeName)
  const [badgeColor, setBadgeColor] = useState(user.badgeColor || '#008c95')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [deviceNameInput, setDeviceNameInput] = useState('')
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)

  useEffect(() => {
    setWebAuthnSupported(typeof window !== 'undefined' && 'PublicKeyCredential' in window)
  }, [])

  const passkey = usePasskeyManagement(user.id, revalidator)

  const profileError = profileMutation.error?.message
  const passwordError = passwordMutation.error?.message
  // Only privileged roles (admin / author) can paint a custom badge
  // next to their comments. Visitors keep the field hidden — the
  // server-side updateProfile action enforces the same rule.
  const canSetBadge = user.role === 'admin' || user.role === 'author'
  const initial = (user.name || user.email || '?').slice(0, 1).toUpperCase()
  const roleLabelText = user.role ? roleLabel(user.role) : '匿名'

  return (
    <AdminListPage>
      <AdminListPage.Header title="个人信息" description="查看与修改你自己的资料、徽章和密码。" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <Avatar className="size-20">
                <AvatarImage src={`/images/avatar/${user.id}.png`} alt={user.name} />
                <AvatarFallback className="bg-muted text-lg font-semibold">{initial}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-lg font-semibold">{user.name || '未命名'}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {user.role === 'admin' && <Badge variant="secondary">管理员</Badge>}
                {user.role === 'author' && <Badge variant="secondary">作者</Badge>}
                {user.role === 'visitor' && <Badge variant="secondary">访客</Badge>}
                {user.role === null && <Badge variant="outline">匿名</Badge>}
                {user.badgeName && (
                  <Badge
                    className="border-transparent"
                    style={{
                      backgroundColor: user.badgeColor || 'var(--brand)',
                      color: '#fff',
                    }}
                  >
                    {user.badgeName}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>统计信息</CardTitle>
              <CardDescription>你的评论与账户活动。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">评论总数</span>
                <span className="font-medium">{counts.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">待审核</span>
                <span className={counts.pending > 0 ? 'font-medium text-destructive' : 'font-medium'}>
                  {counts.pending}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">申请删除</span>
                <span className={counts.deleteRequested > 0 ? 'font-medium text-destructive' : 'font-medium'}>
                  {counts.deleteRequested}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">注册时间</span>
                <span>{user.createdAt ? formatLocalDate(new Date(user.createdAt), DATE_FORMAT, config) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">角色</span>
                <span>{roleLabelText}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">最近 IP</span>
                <span className="break-all">{maskIp(user.lastIp) ?? '—'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">最近 User-Agent</span>
                <span className="text-xs break-all">{maskUa(user.lastUa) ?? '—'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>编辑信息</CardTitle>
              <CardDescription>修改后立即对你在前后台的展示生效。</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setProfileMessage(null)
                  // Empty link → null (Zod's z.url() rejects empty
                  // strings; clearing the field must send the "no link"
                  // sentinel rather than a blank string).
                  const trimmedLink = link.trim()
                  const payload: Record<string, string | null> = {
                    name,
                    link: trimmedLink === '' ? null : trimmedLink,
                  }
                  if (canSetBadge) {
                    payload.badgeName = badgeName || null
                    payload.badgeColor = badgeColor || null
                  }
                  profileMutation.mutate(payload)
                }}
                className="grid gap-4 sm:grid-cols-2"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-name">用户名</Label>
                  <Input
                    id="profile-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-email">邮箱</Label>
                  <Input id="profile-email" type="email" value={user.email} disabled />
                  <p className="text-xs text-muted-foreground">如需修改邮箱请联系管理员。</p>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="profile-link">个人主页</Label>
                  <Input
                    id="profile-link"
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                {canSetBadge && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profile-badge-name">徽章名称</Label>
                      <Input
                        id="profile-badge-name"
                        type="text"
                        value={badgeName}
                        onChange={(e) => setBadgeName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profile-badge-color">徽章颜色</Label>
                      <Input
                        id="profile-badge-color"
                        type="color"
                        value={badgeColor}
                        onChange={(e) => setBadgeColor(e.target.value)}
                        className="h-9 p-1"
                      />
                    </div>
                  </>
                )}
                {!!profileError && <div className="text-sm text-destructive sm:col-span-2">{profileError}</div>}
                {!!profileMessage && (
                  <div className="text-sm text-status-success-fg sm:col-span-2">{profileMessage}</div>
                )}
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button type="submit" disabled={profileMutation.isPending}>
                    <SaveIcon data-icon /> {profileMutation.isPending ? '保存中…' : '保存'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>修改密码</CardTitle>
              <CardDescription>修改密码后，你在其他设备的会话将被强制注销。</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setPasswordMessage(null)
                  passwordMutation.mutate({ oldPassword, newPassword })
                }}
                className="grid gap-4 sm:grid-cols-2"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-old-pw">原密码</Label>
                  <div className="relative">
                    <Input
                      id="profile-old-pw"
                      type={showOldPassword ? 'text' : 'password'}
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      aria-label={showOldPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showOldPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-new-pw">新密码</Label>
                  <div className="relative">
                    <Input
                      id="profile-new-pw"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      aria-label={showNewPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showNewPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                </div>
                {!!passwordError && <div className="text-sm text-destructive sm:col-span-2">{passwordError}</div>}
                {!!passwordMessage && (
                  <div className="text-sm text-status-success-fg sm:col-span-2">{passwordMessage}</div>
                )}
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button type="submit" variant="outline" disabled={passwordMutation.isPending}>
                    <KeyRoundIcon data-icon /> {passwordMutation.isPending ? '更新中…' : '修改密码'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {webAuthnSupported && (
            <Card>
              <CardHeader>
                <CardTitle>Passkey 管理</CardTitle>
                <CardDescription>管理你的 Passkey 凭据与登录偏好。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {passkey.isLoading ? (
                  <p className="text-sm text-muted-foreground">加载中…</p>
                ) : passkey.credentials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚未注册任何 Passkey。</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {passkey.credentials.map((c) => (
                      <li key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FingerprintIcon size={16} className="text-muted-foreground" />
                          <span className="text-sm">{c.deviceName || '未命名设备'}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.createdAt ? formatLocalDate(new Date(c.createdAt), DATE_FORMAT, config) : ''}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={passkey.deletePending}
                          onClick={() => passkey.handleDelete(c.id)}
                          aria-label="删除"
                        >
                          <Trash2Icon size={14} className="text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label htmlFor="passkey-device-name">设备名称（可选）</Label>
                    <Input
                      id="passkey-device-name"
                      value={deviceNameInput}
                      onChange={(e) => setDeviceNameInput(e.target.value)}
                      placeholder={`设备 ${passkey.credentials.length + 1}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={passkey.registerPending}
                    onClick={() => {
                      void passkey.handleRegister(deviceNameInput.trim() || `设备 ${passkey.credentials.length + 1}`)
                    }}
                  >
                    <FingerprintIcon data-icon />
                    {passkey.registerPending ? '注册中…' : '添加新设备'}
                  </Button>
                </div>
                {!!passkey.registerError && <p className="text-sm text-destructive">{passkey.registerError}</p>}
                {!!passkey.registerMessage && (
                  <p className="text-sm text-status-success-fg">{passkey.registerMessage}</p>
                )}

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">强制使用 Passkey 登录</span>
                    <span className="text-xs text-muted-foreground">
                      开启后密码登录将被禁用，忘记密码会同时清除所有 Passkey。
                    </span>
                  </div>
                  <Switch
                    checked={user.passkeyForce}
                    disabled={passkey.credentials.length === 0 || passkey.setForceMutation.isPending}
                    onCheckedChange={(val) => passkey.setForceMutation.mutate({ force: val })}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminListPage>
  )
}
