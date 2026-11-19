import { DEFAULT_LOCALE, type AppLocale } from '@kobato/i18n/locales.ts'
import { Button } from '@kobato/ui/components/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@kobato/ui/components/dialog.tsx'
import { Input } from '@kobato/ui/components/input.tsx'
import { Label } from '@kobato/ui/components/label.tsx'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { formatBytes } from '@kobato/utils/format.ts'
import { useFileUpload } from '@kobato/web-admin/ui/shared/use-file-upload.ts'
import { isApiAccepted } from '@kobato/web-client/lib/api-error.ts'
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Form, useNavigation, useRouteLoaderData } from 'react-router'

const inputClasses =
  'h-auth-input rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

type InstallMode = 'install' | 'restore'

function useCsrfToken(): string | undefined {
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  return rootData?.csrfToken
}

export function AdminInstallForm({ locale: selectedLocale = DEFAULT_LOCALE }: { locale?: AppLocale }) {
  const { locale, t } = useI18n()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting' && navigation.formMethod === 'POST'
  const [showPassword, setShowPassword] = useState(false)
  const csrfToken = useCsrfToken()

  const [mode, setMode] = useState<InstallMode>('install')
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [waitingForRestart, setWaitingForRestart] = useState(false)
  const [waitStatus, setWaitStatus] = useState<'polling' | 'timeout'>('polling')
  const pollAbortRef = useRef<AbortController | null>(null)

  const { upload: uploadRestore, pending: isRestoring } = useFileUpload({
    endpoint: '/api/setup/restore',
    credentials: 'include',
    parseJson: true,
    t,
    messages: {
      httpFailure: () => t('auth.install.restoreFailed'),
      failure: 'auth.install.networkError',
    },
    onError: setRestoreError,
    onSuccess: (body) => {
      if (isApiAccepted(body)) {
        setWaitingForRestart(true)
        setWaitStatus('polling')
        pollAbortRef.current = new AbortController()
        void pollReady(pollAbortRef.current.signal)
      }
    },
  })

  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (file && !/\.(db|db\.tar\.gz|db\.gz|gz)$/i.test(file.name)) {
      setRestoreError(t('auth.install.unsupportedFormat'))
      setSelectedFile(null)
      e.target.value = ''
      return
    }
    setRestoreError(null)
    setSelectedFile(file)
  }

  async function pollReady(signal: AbortSignal) {
    const MAX_ATTEMPTS = 150
    const INTERVAL_MS = 2000

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (signal.aborted) {
        return
      }

      try {
        const res = await fetch('/ready', { cache: 'no-store', signal })
        if (res.ok) {
          window.location.href = '/admin/signin'
          return
        }
      } catch {}

      await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL_MS))
    }

    if (!signal.aborted) {
      setWaitStatus('timeout')
    }
  }

  async function handleRestoreSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setRestoreError(null)
    await uploadRestore(new FormData(e.currentTarget))
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <Dialog open={waitingForRestart}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2Icon className="animate-spin" size={18} />
              {waitStatus === 'polling' ? t('auth.install.restoringDb') : t('auth.install.connectTimeout')}
            </DialogTitle>
            <DialogDescription>
              {waitStatus === 'polling' ? t('auth.install.restartReceived') : t('auth.install.restartTimeout')}
            </DialogDescription>
          </DialogHeader>
          {waitStatus === 'timeout' && (
            <Button onClick={() => (window.location.href = '/admin/signin')}>{t('auth.install.goSignin')}</Button>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex w-full rounded-xl bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('install')
            setRestoreError(null)
            setSelectedFile(null)
          }}
          className={cn(
            'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors',
            mode === 'install'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('auth.install.fresh')}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('restore')
            setRestoreError(null)
            setSelectedFile(null)
          }}

          className={cn(
            'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors',
            mode === 'restore'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
            '',
          )}
        >
          {t('auth.install.fromBackup')}
        </button>
      </div>

      {mode === 'install' ? (
        <Form method="post" id="adminInstallForm" className="flex w-full flex-col gap-6">
          <input type="hidden" name="intent" value="install" />
          <input type="hidden" name="locale" value={selectedLocale} />
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-title" className="text-admin-base font-semibold">
              {t('auth.install.siteName')}
            </Label>
            <Input
              id="install-title"
              name="title"
              type="text"
              autoComplete="off"
              placeholder={t('auth.install.siteNamePlaceholder')}
              required
              disabled={isSubmitting}
              className={inputClasses}
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-name" className="text-admin-base font-semibold">
              {t('auth.install.nickname')}
            </Label>
            <Input
              id="install-name"
              name="name"
              type="text"
              autoComplete="nickname"
              placeholder={t('auth.install.nicknamePlaceholder')}
              required
              disabled={isSubmitting}
              className={inputClasses}
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-email" className="text-admin-base font-semibold">
              {t('auth.install.email')}
            </Label>
            <Input
              id="install-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder={t('auth.shared.emailPlaceholder')}
              required
              disabled={isSubmitting}
              className={inputClasses}
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-password" className="text-admin-base font-semibold">
              {t('auth.install.password')}
            </Label>
            <div className="relative w-full">
              <Input
                id="install-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('auth.install.passwordPlaceholder')}
                required
                minLength={10}
                disabled={isSubmitting}
                className={cn(inputClasses, 'pr-12')}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="px-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? t('auth.shared.hidePassword') : t('auth.shared.showPassword')}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-7 h-auth-btn w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {isSubmitting ? (
              t('auth.install.creating')
            ) : (
              <>
                {t('auth.install.create')} <span aria-hidden>&rarr;</span>
              </>
            )}
          </Button>
        </Form>
      ) : (
        <form
          onSubmit={(e) => {
            void handleRestoreSubmit(e)
          }}
          encType="multipart/form-data"
          className="flex w-full flex-col gap-6"
        >
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="restore-file" className="text-admin-base font-semibold">
              {t('auth.install.backupFile')}
            </Label>
            <input
              ref={fileInputRef}
              id="restore-file"
              name="file"
              type="file"
              accept=".db,.gz,application/gzip"
              required
              disabled={isRestoring}
              onChange={handleFileChange}
              className="sr-only"
              aria-label={t('auth.install.selectBackup')}
            />
            <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRestoring}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? t('auth.install.reselect') : t('auth.install.select')}
              </Button>
              {selectedFile ? (
                <span className="text-sm text-muted-foreground">
                  {selectedFile.name}（{formatBytes(selectedFile.size, { locale })}）
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">{t('auth.install.noFile')}</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">{t('auth.install.restoreNotes')}</p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>{t('auth.install.noteFormats')}</li>
              <li>{t('auth.install.noteDbOnly')}</li>
              <li>{t('auth.install.noteAssets')}</li>
            </ul>
          </div>

          {restoreError ? (
            <div role="alert" aria-live="polite" className="text-center text-sm leading-relaxed text-destructive">
              {restoreError}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isRestoring || restoreError !== null}
            className="mt-7 h-auth-btn w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {isRestoring ? t('auth.install.restoring') : t('auth.install.uploadRestore')}
          </Button>
        </form>
      )}
    </div>
  )
}
