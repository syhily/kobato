import {
  AlertCircleIcon,
  ArrowUpCircleIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  TagIcon,
} from 'lucide-react'
import { useCallback, useState } from 'react'

import { orpc } from '@/client/api/client'
import { useQuery } from '@/client/api/query'
import { APP_AUTHOR, APP_DESCRIPTION, APP_HOMEPAGE, APP_NAME, APP_VERSION } from '@/shared/config/version'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { GithubIcon } from '@/ui/icons/brand'
import { cn } from '@/ui/lib/cn'
import { Image } from '@/ui/public/widgets/Image'

type CheckState = 'idle' | 'loading' | 'up-to-date' | 'available' | 'dev' | 'error'

const IS_DEV_BUILD = APP_VERSION.includes('-dev')

interface VersionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VersionDialog({ open, onOpenChange }: VersionDialogProps) {
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null)

  const { data: avatarData } = useQuery({
    queryKey: ['github', 'avatar'],
    queryFn: () => orpc.github.avatar({}),
    staleTime: 1000 * 60 * 60,
  })

  const handleCheckUpdate = useCallback(async () => {
    if (IS_DEV_BUILD) {
      setCheckState('dev')
      return
    }
    setCheckState('loading')
    try {
      const release = await orpc.github.release({})
      const latest = release.tagName.replace(/^v/, '')
      setLatestVersion(release.tagName)
      setReleaseUrl(release.htmlUrl)
      setCheckState(latest === APP_VERSION ? 'up-to-date' : 'available')
    } catch {
      setCheckState('error')
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="size-5 text-muted-foreground" />
            系统版本
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="size-16">
              <img
                src="/logo.svg?original"
                alt="站点图标"
                className="h-full w-full rounded-xl object-cover dark:hidden"
              />
              <img
                src="/logo-dark.svg?original"
                alt="站点图标"
                className="hidden h-full w-full rounded-xl object-cover dark:block"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">{APP_NAME.charAt(0).toUpperCase() + APP_NAME.slice(1)}</div>
              <span
                className={cn(
                  'rounded-xl px-2 py-0.5 text-xs font-semibold',
                  IS_DEV_BUILD
                    ? 'bg-status-warning-bg text-status-warning-fg'
                    : 'bg-status-success-bg text-status-success-fg',
                )}
              >
                v{APP_VERSION}
              </span>
            </div>
            <div className="text-center text-sm text-muted-foreground">{APP_DESCRIPTION}</div>
          </div>

          {/* Links */}
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
              问题反馈
            </VersionLink>
          </div>

          {/* Update check */}
          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">更新检查</span>
              <button
                type="button"
                onClick={() => void handleCheckUpdate()}
                disabled={checkState === 'loading'}
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
                检查更新
              </button>
            </div>

            <UpdateStatus state={checkState} latestVersion={latestVersion} releaseUrl={releaseUrl} />
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
  latestVersion,
  releaseUrl,
}: {
  state: CheckState
  latestVersion: string | null
  releaseUrl: string | null
}) {
  if (state === 'idle') {
    return <div className="mt-2 text-xs text-muted-foreground">点击上方按钮检查是否有新版本</div>
  }

  if (state === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        正在检查...
      </div>
    )
  }

  if (state === 'up-to-date') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-status-success-fg">
        <CheckCircleIcon className="size-3.5" />
        当前已是最新版本
      </div>
    )
  }

  if (state === 'dev') {
    return (
      <div className="text-status-warning-fg mt-2 flex items-center gap-1.5 text-xs">
        <AlertCircleIcon className="size-3.5" />
        当前为开发版本，更新检查已跳过
      </div>
    )
  }

  if (state === 'available' && latestVersion && releaseUrl) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <ArrowUpCircleIcon className="size-3.5 text-status-info-fg" />
        <span className="text-status-info-fg">发现新版本：</span>
        <a
          href={releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-status-info-fg underline underline-offset-2 hover:opacity-80"
        >
          {latestVersion}
          <ExternalLinkIcon className="size-3" />
        </a>
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircleIcon className="size-3.5" />
      检查失败，请稍后重试
    </div>
  )
}
