import { useMutation } from '@tanstack/react-query'
import { SaveIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import type { LoginMethod } from '@/shared/contracts/users'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { formatLocalDate } from '@/shared/utils/formatter'
import { ROLE_LABEL_KEYS } from '@/shared/utils/roles'
import { LoginMethodCard } from '@/ui/admin/my/LoginMethodCard'
import { PasskeyManagementCard } from '@/ui/admin/my/PasskeyManagementCard'
import { PasswordChangeForm } from '@/ui/admin/my/PasswordChangeForm'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Separator } from '@/ui/components/separator'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
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
  loginMethod: LoginMethod
}

export interface MyProfileCounts {
  total: number
  pending: number
  deleteRequested: number
}

export interface MyProfileViewProps {
  user: MyProfileUser
  counts: MyProfileCounts
  passkeyEnabled: boolean
  mailReady: boolean
}

export function MyProfileView({ user, counts, passkeyEnabled, mailReady }: MyProfileViewProps) {
  const { t } = useI18n()
  const config = useSiteIdentity()
  const revalidator = useRevalidator()

  const profileMutation = useMutation({
    ...orpcQuery.account.updateProfile.mutationOptions(),
    onSuccess: () => {
      setProfileMessage(t('admin.my.profile.saved'))
      // Re-run the route loader so avatar / stats pick up a name change without a reload.
      void revalidator.revalidate()
    },
  })

  const [name, setName] = useState(user.name)
  const [link, setLink] = useState(user.link)
  const [badgeName, setBadgeName] = useState(user.badgeName)
  const [badgeColor, setBadgeColor] = useState(user.badgeColor || '#007a82')
  const [profileMessage, setProfileMessage] = useState<string | null>(null)

  const profileError = profileMutation.error?.message
  // Only privileged roles can paint a custom badge; the updateProfile action enforces the same rule.
  const canSetBadge = user.role === 'admin' || user.role === 'author'
  const initial = (user.name || user.email || '?').slice(0, 1).toUpperCase()
  const roleLabelText = user.role ? t(ROLE_LABEL_KEYS[user.role]) : t('common.role.anonymous')

  return (
    <AdminListPage>
      <AdminListPage.Header title={t('admin.my.profile.title')} description={t('admin.my.profile.description')} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <Avatar className="size-20">
                <AvatarImage src={avatarImageUrl(user.id)} alt={user.name} />
                <AvatarFallback className="bg-muted text-lg font-semibold">{initial}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-lg font-semibold">{user.name || t('admin.my.profile.unnamed')}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {user.role === 'admin' && <Badge variant="secondary">{t(ROLE_LABEL_KEYS.admin)}</Badge>}
                {user.role === 'author' && <Badge variant="secondary">{t(ROLE_LABEL_KEYS.author)}</Badge>}
                {user.role === 'visitor' && <Badge variant="secondary">{t(ROLE_LABEL_KEYS.visitor)}</Badge>}
                {user.role === null && <Badge variant="outline">{t('common.role.anonymous')}</Badge>}
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
              <CardTitle>{t('admin.my.profile.stats')}</CardTitle>
              <CardDescription>{t('admin.my.profile.statsDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.my.profile.commentCount')}</span>
                <span className="font-medium">{counts.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.my.profile.pending')}</span>
                <span className={cn('font-medium', counts.pending > 0 && 'text-destructive')}>{counts.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.my.profile.deleteRequested')}</span>
                <span className={cn('font-medium', counts.deleteRequested > 0 && 'text-destructive')}>
                  {counts.deleteRequested}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.my.profile.registered')}</span>
                <span>{user.createdAt ? formatLocalDate(new Date(user.createdAt), DATE_FORMAT, config) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.my.profile.role')}</span>
                <span>{roleLabelText}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('admin.my.profile.lastIp')}</span>
                <span className="break-all">{maskIp(user.lastIp) ?? '—'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('admin.my.profile.lastUa')}</span>
                <span className="text-xs break-all">{maskUa(user.lastUa) ?? '—'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.my.profile.editTitle')}</CardTitle>
              <CardDescription>{t('admin.my.profile.editDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setProfileMessage(null)
                  // Empty link → null — z.url() rejects empty strings; clearing must send the "no link" sentinel.
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
                  <Label htmlFor="profile-name">{t('admin.my.profile.name')}</Label>
                  <Input
                    id="profile-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-email">{t('admin.my.profile.email')}</Label>
                  <Input id="profile-email" type="email" value={user.email} disabled />
                  <p className="text-xs text-muted-foreground">{t('admin.my.profile.emailHint')}</p>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="profile-link">{t('admin.my.profile.link')}</Label>
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
                      <Label htmlFor="profile-badge-name">{t('admin.my.profile.badgeName')}</Label>
                      <Input
                        id="profile-badge-name"
                        type="text"
                        value={badgeName}
                        onChange={(e) => setBadgeName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profile-badge-color">{t('admin.my.profile.badgeColor')}</Label>
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
                    <SaveIcon data-icon />{' '}
                    {profileMutation.isPending ? t('admin.my.profile.saving') : t('common.action.save')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <PasswordChangeForm />
          <LoginMethodCard loginMethod={user.loginMethod} passkeyEnabled={passkeyEnabled} mailReady={mailReady} />
          <PasskeyManagementCard userId={user.id} passkeyEnabled={passkeyEnabled} />
        </div>
      </div>
    </AdminListPage>
  )
}
