import { useQuery } from '@tanstack/react-query'
import {
  AlertCircleIcon,
  ArrowUpCircleIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  TagIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { UpdateCheckResult, UpdateJobState } from '@/shared/contracts/update'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { APP_AUTHOR, APP_DESCRIPTION, APP_HOMEPAGE, APP_NAME, APP_VERSION } from '@/shared/config/version'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { GithubIcon } from '@/ui/icons/brand'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { Image } from '@/ui/public/widgets/Image'

type CheckState = 'idle' | 'loading' | 'up-to-date' | 'available' | 'dev' | 'error'

const IS_DEV_BUILD = APP_VERSION.includes('-dev')

// Job-panel copy; no 'succeeded' state — the process exits on success.
const JOB_STATE_COPY: Partial<Record<UpdateJobState, UiMessageId>> = {
  downloading: 'admin.shell.version.job.downloading',
  verifying: 'admin.shell.version.job.verifying',
  swapping: 'admin.shell.version.job.swapping',
  restarting: 'admin.shell.version.job.restarting',
}

interface VersionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VersionDialog({ open, onOpenChange }: VersionDialogProps) {
  const { t } = useI18n()
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null)
  const [jobStarted, setJobStarted] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const { data: avatarData } = useQuery(orpcQuery.github.avatar.queryOptions({ input: {}, staleTime: 1000 * 60 * 60 }))

  // Self-update job polling: enabled once apply succeeds; the interval stops
  // on failure, and on 'restarting' the process exits and the page reloads itself.
  const { data: jobStatus } = useQuery(
    orpcQuery.admin.update.status.queryOptions({
      input: {},
      enabled: jobStarted,
      refetchInterval: (query) => (query.state.data?.state === 'failed' ? false : 1500),
    }),
  )
  const jobState: UpdateJobState = jobStatus?.state ?? 'downloading'
  const jobRunning = jobStarted && jobState !== 'failed'

  useEffect(() => {
    if (!jobStarted || jobStatus?.state !== 'restarting') {
      return
    }
    const timer = setTimeout(() => {
      window.location.reload()
    }, 10_000)
    return () => clearTimeout(timer)
  }, [jobStarted, jobStatus?.state])

  const handleCheckUpdate = useCallback(async () => {
    if (IS_DEV_BUILD) {
      setCheckState('dev')
      return
    }
    setCheckState('loading')
    try {
      const result = await orpc.admin.update.check({})
      setCheckResult(result)
      setCheckState(result.updateAvailable ? 'available' : 'up-to-date')
    } catch {
      setCheckState('error')
    }
  }, [])

  const handleApplyUpdate = useCallback(async () => {
    setApplyError(null)
    try {
      await orpc.admin.update.apply({})
      setJobStarted(true)
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : t('admin.shell.version.applyFailedFallback'))
    }
  }, [t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="size-5 text-muted-foreground" />
            {t('admin.shell.version.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3">
            <div className="size-16">
              <img
                src="/logo.svg?original"
                alt={t('admin.shell.brand.iconAlt')}
                className="h-full w-full rounded-xl object-cover dark:hidden"
              />
              <img
                src="/logo-dark.svg?original"
                alt={t('admin.shell.brand.iconAlt')}
                className="hidden h-full w-full rounded-xl object-cover dark:block"
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className="text-lg font-semibold">{APP_NAME.charAt(0).toUpperCase() + APP_NAME.slice(1)}</div>
              <span
                className={cn(
                  'rounded-xl px-2 py-0.5 text-xs font-semibold',
                  IS_DEV_BUILD
                    ? 'bg-status-warn-bg text-status-warn-fg'
                    : 'bg-status-success-bg text-status-success-fg',
                )}
              >
                v{APP_VERSION}
              </span>
            </div>
            <div className="text-center text-sm text-muted-foreground">{APP_DESCRIPTION}</div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <VersionLink
              href="https://yufan.me"
              icon={
                avatarData?.avatar ? (
                  <Image src={avatarData.avatar} alt="" width={14} height={14} className="size-3.5" loading="lazy" />
                ) : (
                  <div className="size-3.5 rounded-full bg-muted" />
                )
              }
            >
              {APP_AUTHOR.name}
            </VersionLink>
            <VersionLink href={APP_HOMEPAGE} icon={<GithubIcon className="size-3.5" />}>
              GitHub
            </VersionLink>
            <VersionLink href={`${APP_HOMEPAGE}/issues`} icon={<ExternalLinkIcon className="size-3.5" />}>
              {t('admin.shell.version.feedback')}
            </VersionLink>
          </div>

          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('admin.shell.version.checkTitle')}</span>
              <button
                type="button"
                onClick={() => void handleCheckUpdate()}
                disabled={checkState === 'loading' || jobRunning}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                {checkState === 'loading' ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-3.5" />
                )}
                {t('admin.shell.version.check')}
              </button>
            </div>

            <UpdateStatus
              state={checkState}
              checkResult={checkResult}
              jobRunning={jobRunning}
              onApplyUpdate={() => void handleApplyUpdate()}
            />

            {applyError !== null && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircleIcon className="size-3.5" />
                {t('admin.shell.version.applyFailed', { message: applyError })}
              </div>
            )}

            {jobStarted && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {jobState === 'failed' ? (
                  <>
                    <AlertCircleIcon className="size-3.5 text-destructive" />
                    <span className="text-destructive">
                      {t('admin.shell.version.jobFailed', {
                        message: jobStatus?.error ?? t('admin.shell.error.unknown'),
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {t(JOB_STATE_COPY[jobState] ?? 'admin.shell.version.job.downloading')}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VersionLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {children}
    </a>
  )
}

function UpdateStatus({
  state,
  checkResult,
  jobRunning,
  onApplyUpdate,
}: {
  state: CheckState
  checkResult: UpdateCheckResult | null
  jobRunning: boolean
  onApplyUpdate: () => void
}) {
  const { t } = useI18n()

  if (state === 'idle') {
    return <div className="mt-2 text-xs text-muted-foreground">{t('admin.shell.version.idle')}</div>
  }

  if (state === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        {t('admin.shell.version.checking')}
      </div>
    )
  }

  if (state === 'up-to-date') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-status-success-fg">
        <CheckCircleIcon className="size-3.5" />
        {t('admin.shell.version.upToDate')}
      </div>
    )
  }

  if (state === 'dev') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-status-warn-fg">
        <AlertCircleIcon className="size-3.5" />
        {t('admin.shell.version.dev')}
      </div>
    )
  }

  if (state === 'available' && checkResult) {
    return (
      <div className="mt-2 flex flex-col gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <ArrowUpCircleIcon className="size-3.5 text-status-info-fg" />
          <span className="text-status-info-fg">{t('admin.shell.version.available')}</span>
          <a
            href={checkResult.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-status-info-fg underline underline-offset-2 hover:opacity-80"
          >
            {checkResult.tagName}
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
        {checkResult.canSelfUpdate ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onApplyUpdate}
              disabled={jobRunning}
              className={cn(
                'inline-flex w-fit items-center gap-1.5 rounded-xl border px-3 py-1.5 font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              <ArrowUpCircleIcon className="size-3.5" />
              {t('admin.shell.version.apply')}
            </button>
            <p className="text-muted-foreground">{t('admin.shell.version.applyHint')}</p>
          </div>
        ) : (
          checkResult.reasons.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-muted-foreground">
              {checkResult.reasons.map((reason) => (
                <li key={reason.messageKey} className="flex items-center gap-1.5">
                  <AlertCircleIcon className="size-3.5 shrink-0" />
                  {t(reason.messageKey)}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircleIcon className="size-3.5" />
      {t('admin.shell.version.checkFailed')}
    </div>
  )
}
