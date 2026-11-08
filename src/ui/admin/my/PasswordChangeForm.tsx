import { useMutation } from '@tanstack/react-query'
import { EyeIcon, EyeOffIcon, KeyRoundIcon } from 'lucide-react'
import { useState } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { useI18n } from '@/ui/lib/I18nProvider'

export function PasswordChangeForm() {
  const { t } = useI18n()
  const passwordMutation = useMutation({
    ...orpcQuery.account.updatePassword.mutationOptions(),
    onSuccess: () => {
      setPasswordMessage(t('admin.my.password.updated'))
      setOldPassword('')
      setNewPassword('')
    },
  })

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)

  const passwordError = passwordMutation.error?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.my.password.title')}</CardTitle>
        <CardDescription>{t('admin.my.password.description')}</CardDescription>
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
            <Label htmlFor="profile-old-pw">{t('admin.my.password.old')}</Label>
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
                aria-label={showOldPassword ? t('admin.my.password.hide') : t('admin.my.password.show')}
              >
                {showOldPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-new-pw">{t('admin.my.password.new')}</Label>
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
                aria-label={showNewPassword ? t('admin.my.password.hide') : t('admin.my.password.show')}
              >
                {showNewPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>
          {!!passwordError && (
            <div className="text-sm text-destructive sm:col-span-2" role="alert" aria-live="assertive">
              {passwordError}
            </div>
          )}
          {!!passwordMessage && (
            <div className="text-sm text-status-success-fg sm:col-span-2" role="status">
              {passwordMessage}
            </div>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="submit" variant="outline" disabled={passwordMutation.isPending}>
              <KeyRoundIcon data-icon />{' '}
              {passwordMutation.isPending ? t('admin.my.password.updating') : t('admin.my.password.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
