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

import {
  APP_AUTHOR,
  APP_DESCRIPTION,
  APP_HOMEPAGE,
  APP_NAME,
  APP_REPOSITORY,
  APP_VERSION,
} from '@/shared/config/version'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { GithubIcon } from '@/ui/icons/brand-social-icons'
import { cn } from '@/ui/lib/cn'

interface GitHubRelease {
  tag_name: string
  html_url: string
  name: string
  published_at: string
}

type CheckState = 'idle' | 'loading' | 'up-to-date' | 'available' | 'error'

interface VersionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VersionDialog({ open, onOpenChange }: VersionDialogProps) {
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null)

  const handleCheckUpdate = useCallback(async () => {
    setCheckState('loading')
    try {
      const match = APP_REPOSITORY.match(/github\.com\/([^/]+)\/([^/]+)/)
      if (!match) {
        setCheckState('error')
        return
      }
      const [, owner, repo] = match
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
      if (!response.ok) {
        setCheckState('error')
        return
      }
      const release = (await response.json()) as GitHubRelease
      const latest = release.tag_name.replace(/^v/, '')
      setLatestVersion(release.tag_name)
      setReleaseUrl(release.html_url)
      setCheckState(latest === APP_VERSION ? 'up-to-date' : 'available')
    } catch {
      setCheckState('error')
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
              <img src="/logo.svg" alt="站点图标" className="h-full w-full rounded-md object-cover dark:hidden" />
              <img
                src="/logo-dark.svg"
                alt="站点图标"
                className="hidden h-full w-full rounded-md object-cover dark:block"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">{APP_NAME.charAt(0).toUpperCase() + APP_NAME.slice(1)}</div>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                v{APP_VERSION}
              </span>
            </div>
            <div className="text-center text-sm text-muted-foreground">{APP_DESCRIPTION}</div>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-2">
            <VersionLink
              href="https://yufan.me"
              icon={<img src="https://avatars.githubusercontent.com/u/1761698?s=32" alt="" className="size-3.5" />}
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
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">更新检查</span>
              <button
                type="button"
                onClick={() => void handleCheckUpdate()}
                disabled={checkState === 'loading'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
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
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
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
      <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
        <CheckCircleIcon className="size-3.5" />
        当前已是最新版本
      </div>
    )
  }

  if (state === 'available' && latestVersion && releaseUrl) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <ArrowUpCircleIcon className="size-3.5 text-blue-600" />
        <span className="text-blue-600">发现新版本：</span>
        <a
          href={releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
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
