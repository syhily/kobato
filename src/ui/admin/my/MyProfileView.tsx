import { KeyRoundIcon, SaveIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import { useMutation, orpcQuery } from '@/client/api/query'
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
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)

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
                {!!profileMessage && <div className="text-sm text-green-600 sm:col-span-2">{profileMessage}</div>}
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
                  <Input
                    id="profile-old-pw"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-new-pw">新密码</Label>
                  <Input
                    id="profile-new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                {!!passwordError && <div className="text-sm text-destructive sm:col-span-2">{passwordError}</div>}
                {!!passwordMessage && <div className="text-sm text-green-600 sm:col-span-2">{passwordMessage}</div>}
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button type="submit" variant="outline" disabled={passwordMutation.isPending}>
                    <KeyRoundIcon data-icon /> {passwordMutation.isPending ? '更新中…' : '修改密码'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminListPage>
  )
}
