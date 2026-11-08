import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SaveIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminUserDto } from '@/shared/contracts/users'

import { orpc } from '@/client/api/client'
import { buildUserUpdatePayload } from '@/ui/admin/users/user-update-payload'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Checkbox } from '@/ui/components/checkbox'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { useI18n } from '@/ui/lib/I18nProvider'

const DEFAULT_BADGE_TEXT_COLOR = '#ffffff'

interface UserEditFormProps {
  user: AdminUserDto
}

export function UserEditForm({ user }: UserEditFormProps) {
  const { t } = useI18n()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [link, setLink] = useState(user.link ?? '')
  const [badgeName, setBadgeName] = useState(user.badgeName ?? '')
  const [badgeColor, setBadgeColor] = useState(user.badgeColor ?? '#007a82')
  const [useTextOverride, setUseTextOverride] = useState(user.badgeTextColor !== null)
  const [badgeTextColor, setBadgeTextColor] = useState(user.badgeTextColor ?? DEFAULT_BADGE_TEXT_COLOR)

  // Re-seed the draft when a different user object arrives (e.g. after a refetch) — render-phase adjustment pattern.
  const [lastUser, setLastUser] = useState(user)
  if (user !== lastUser) {
    setLastUser(user)
    setName(user.name)
    setEmail(user.email)
    setLink(user.link ?? '')
    setBadgeName(user.badgeName ?? '')
    setBadgeColor(user.badgeColor ?? '#007a82')
    setUseTextOverride(user.badgeTextColor !== null)
    setBadgeTextColor(user.badgeTextColor ?? DEFAULT_BADGE_TEXT_COLOR)
  }

  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (vars: Record<string, string | null> & { userId: string }) => {
      const { userId, ...body } = vars
      return orpc.admin.users.update({ id: userId, ...body })
    },
    onSuccess: () => {
      invalidateUsersCache(queryClient)
    },
  })

  const updateError = updateMutation.error?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.users.edit.title')}</CardTitle>
        <CardDescription>{t('admin.users.edit.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const payload = buildUserUpdatePayload({
              name,
              email,
              link,
              badgeName,
              badgeColor,
              useTextOverride,
              badgeTextColor,
            })
            updateMutation.mutate({ ...payload, userId: user.id })
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-name">{t('admin.users.edit.name')}</Label>
            <Input id="user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-email">{t('admin.users.edit.email')}</Label>
            <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="user-link">{t('admin.users.edit.link')}</Label>
            <Input
              id="user-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-badge-name">{t('admin.users.edit.badgeName')}</Label>
            <Input id="user-badge-name" type="text" value={badgeName} onChange={(e) => setBadgeName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-badge-color">{t('admin.users.edit.badgeColor')}</Label>
            <Input
              id="user-badge-color"
              type="color"
              value={badgeColor}
              onChange={(e) => setBadgeColor(e.target.value)}
              className="h-9 p-1"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="user-badge-text-color-toggle"
                checked={useTextOverride}
                onCheckedChange={(next) => setUseTextOverride(next === true)}
              />
              <Label htmlFor="user-badge-text-color-toggle" className="cursor-pointer font-normal">
                {t('admin.users.edit.customTextColor')}
              </Label>
              <span className="text-xs text-muted-foreground">{t('admin.users.edit.textColorHint')}</span>
            </div>
            {useTextOverride && (
              <div className="flex items-center gap-3">
                <Input
                  id="user-badge-text-color"
                  type="color"
                  value={badgeTextColor}
                  onChange={(e) => setBadgeTextColor(e.target.value)}
                  className="h-9 w-20 p-1"
                />
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: badgeColor || '#007a82',
                    color: badgeTextColor,
                  }}
                >
                  {badgeName || t('admin.users.edit.preview')}
                </span>
              </div>
            )}
          </div>
          {updateError && <div className="text-sm text-destructive sm:col-span-2">{updateError}</div>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              <SaveIcon data-icon /> {updateMutation.isPending ? t('admin.users.edit.saving') : t('common.action.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
